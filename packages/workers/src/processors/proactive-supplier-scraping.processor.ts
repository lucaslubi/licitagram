import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import type { ProactiveSupplierScrapingJobData } from '../queues/proactive-supplier-scraping.queue'
import { fetchTenderResults } from '../scrapers/pncp-results-client'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'
import { competitionAnalysisQueue } from '../queues/competition-analysis.queue'
import { fornecedorEnrichmentQueue } from '../queues/fornecedor-enrichment.queue'

const CONSULTA_URL = 'https://pncp.gov.br/api/consulta/v1'
const RATE_LIMIT_MS = 500
const TENDERS_PER_JOB = 20
const PAGE_SIZE = 50
const MAX_PAGES = 20 // Safety: max 1000 tenders per run

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await sleep(RATE_LIMIT_MS)
      const response = await fetch(url)

      if (response.ok) return response

      if (response.status === 429 || response.status >= 500) {
        const delay = Math.pow(2, attempt) * 2000
        logger.warn({ url, status: response.status, attempt, delay }, 'Retrying PNCP request (proactive)')
        await sleep(delay)
        continue
      }

      throw new Error(`PNCP API error: ${response.status} ${response.statusText}`)
    } catch (error) {
      if (attempt === retries - 1) throw error
      const delay = Math.pow(2, attempt) * 2000
      logger.warn({ url, attempt, delay, error }, 'Retrying PNCP request after error (proactive)')
      await sleep(delay)
    }
  }
  throw new Error('Max retries exceeded')
}

function formatDatePNCP(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

interface PNCPPublicacaoItem {
  orgaoEntidade?: { cnpj?: string }
  anoCompra?: number
  sequencialCompra?: number
  existeResultado?: boolean
}

interface PNCPPublicacaoResponse {
  data?: PNCPPublicacaoItem[]
  totalRegistros?: number
  totalPaginas?: number
}

/**
 * Fetch recent tender publications from PNCP.
 * Returns a list of tender references (cnpj, ano, sequencial) that have results.
 */
async function fetchRecentPublications(
  dataInicial: string,
  dataFinal: string,
  pagina: number,
): Promise<{ items: PNCPPublicacaoItem[]; totalPaginas: number }> {
  const params = new URLSearchParams({
    dataInicial,
    dataFinal,
    pagina: String(pagina),
    tamanhoPagina: String(PAGE_SIZE),
  })

  const url = `${CONSULTA_URL}/contratacoes/publicacao?${params}`
  logger.info({ url, pagina }, 'Fetching PNCP publications (proactive supplier scraping)')

  const response = await fetchWithRetry(url)
  const json = (await response.json()) as PNCPPublicacaoResponse

  return {
    items: json.data || [],
    totalPaginas: json.totalPaginas || 0,
  }
}

/**
 * Build a pncp_id from a publication item (same format as the rest of the codebase).
 */
function buildPncpIdFromPublication(item: PNCPPublicacaoItem): string | null {
  const cnpj = item.orgaoEntidade?.cnpj?.replace(/\D/g, '')
  const ano = item.anoCompra
  const seq = item.sequencialCompra
  if (!cnpj || !ano || !seq) return null
  return `${cnpj}-${ano}-${seq}`
}

async function processProactiveSupplierScraping(job: Job<ProactiveSupplierScrapingJobData>) {
  const startTime = Date.now()

  // Fetch publications from the last 7 days to catch recent results
  const now = new Date()
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(now.getDate() - 7)

  const dataInicial = formatDatePNCP(sevenDaysAgo)
  const dataFinal = formatDatePNCP(now)

  let totalTendersChecked = 0
  let totalNewCompetitors = 0
  let totalSkipped = 0
  let totalErrors = 0
  let tendersProcessedThisJob = 0

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      // Fetch a page of recent publications
      let publications: { items: PNCPPublicacaoItem[]; totalPaginas: number }
      try {
        publications = await fetchRecentPublications(dataInicial, dataFinal, page)
      } catch (err) {
        logger.error({ err, page }, 'Failed to fetch PNCP publications page (proactive)')
        totalErrors++
        break
      }

      if (!publications.items || publications.items.length === 0) {
        logger.info({ page }, 'No more publications — proactive scraping page empty')
        break
      }

      for (const item of publications.items) {
        // Respect batch size limit per job
        if (tendersProcessedThisJob >= TENDERS_PER_JOB) {
          logger.info(
            { tendersProcessedThisJob, totalNewCompetitors, page },
            'Reached per-job tender limit — stopping',
          )
          break
        }

        const pncpId = buildPncpIdFromPublication(item)
        if (!pncpId) continue

        totalTendersChecked++

        try {
          // Check if we already have competitors for this tender (by pncp_id)
          const { data: existingTender } = await supabase
            .from('tenders')
            .select('id')
            .eq('pncp_id', pncpId)
            .limit(1)

          const tenderId = existingTender?.[0]?.id

          if (tenderId) {
            // Tender exists in our DB — check if it already has competitors
            const { count } = await supabase
              .from('competitors')
              .select('*', { count: 'exact', head: true })
              .eq('tender_id', tenderId)

            if (count && count > 0) {
              totalSkipped++
              continue
            }
          }

          // Fetch results/participants from PNCP
          await sleep(RATE_LIMIT_MS) // Extra rate limiting between tender fetches
          const competitorResults = await fetchTenderResults(pncpId)

          if (competitorResults.length === 0) {
            totalSkipped++
            continue
          }

          // If the tender exists in our DB, use its ID; otherwise use the pncp_id as reference
          if (tenderId) {
            // Upsert competitors linked to existing tender
            const rows = competitorResults.map((r) => {
              let situacao = r.situacao
              if (r.vencedor && situacao.toLowerCase() === 'informado') {
                situacao = 'Homologado'
              }
              return {
                tender_id: tenderId,
                cnpj: r.cnpj,
                nome: r.nome,
                valor_proposta: r.valor_proposta ?? r.valor_final,
                situacao,
              }
            })

            const { error } = await supabase.from('competitors').upsert(rows, {
              onConflict: 'cnpj,tender_id',
              ignoreDuplicates: false,
            })

            if (error) {
              logger.error({ error, pncpId, tenderId }, 'Error upserting competitors (proactive)')
              totalErrors++
              continue
            }

            totalNewCompetitors += competitorResults.length
          } else {
            // Tender not in our DB — we still want the supplier data
            // Create a minimal tender record so we can link competitors
            const cnpjParts = pncpId.split('-')
            const orgaoCnpj = cnpjParts[0]
            const ano = cnpjParts[1]
            const seq = cnpjParts.slice(2).join('-')

            const { data: newTender, error: tenderError } = await supabase
              .from('tenders')
              .insert({
                pncp_id: pncpId,
                source: 'pncp',
                status: 'analyzed',
                orgao_cnpj: orgaoCnpj,
                ano_compra: parseInt(ano, 10),
                sequencial_compra: parseInt(seq, 10),
                titulo: `Contratação ${pncpId}`,
              })
              .select('id')
              .single()

            if (tenderError) {
              // Likely a duplicate — try to fetch existing
              const { data: existing } = await supabase
                .from('tenders')
                .select('id')
                .eq('pncp_id', pncpId)
                .limit(1)

              const existingId = existing?.[0]?.id
              if (!existingId) {
                logger.error({ tenderError, pncpId }, 'Failed to create/find tender for proactive competitors')
                totalErrors++
                continue
              }

              // Insert competitors for the existing tender
              const rows = competitorResults.map((r) => ({
                tender_id: existingId,
                cnpj: r.cnpj,
                nome: r.nome,
                valor_proposta: r.valor_proposta ?? r.valor_final,
                situacao: r.vencedor && r.situacao.toLowerCase() === 'informado' ? 'Homologado' : r.situacao,
              }))

              const { error: insertErr } = await supabase.from('competitors').upsert(rows, {
                onConflict: 'cnpj,tender_id',
                ignoreDuplicates: false,
              })

              if (insertErr) {
                logger.error({ insertErr, pncpId }, 'Error upserting competitors for existing tender (proactive)')
                totalErrors++
                continue
              }

              totalNewCompetitors += competitorResults.length
            } else if (newTender) {
              const rows = competitorResults.map((r) => ({
                tender_id: newTender.id,
                cnpj: r.cnpj,
                nome: r.nome,
                valor_proposta: r.valor_proposta ?? r.valor_final,
                situacao: r.vencedor && r.situacao.toLowerCase() === 'informado' ? 'Homologado' : r.situacao,
              }))

              const { error: insertErr } = await supabase.from('competitors').upsert(rows, {
                onConflict: 'cnpj,tender_id',
                ignoreDuplicates: false,
              })

              if (insertErr) {
                logger.error({ insertErr, pncpId }, 'Error inserting competitors for new tender (proactive)')
                totalErrors++
                continue
              }

              totalNewCompetitors += competitorResults.length
            }
          }

          tendersProcessedThisJob++
        } catch (err) {
          logger.error({ err, pncpId }, 'Error processing tender in proactive scraping')
          totalErrors++
        }
      }

      // Stop if we've hit our per-job limit
      if (tendersProcessedThisJob >= TENDERS_PER_JOB) break

      // Stop if we've gone past the last page
      if (page >= publications.totalPaginas) break

      // Log progress every 5 pages
      if (page % 5 === 0) {
        logger.info(
          { page, totalTendersChecked, totalNewCompetitors, totalSkipped, totalErrors },
          'Proactive supplier scraping progress',
        )
        await job.updateProgress(page)
      }
    }
  } catch (err) {
    logger.error({ err }, 'Unexpected error in proactive supplier scraping')
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  logger.info(
    {
      totalTendersChecked,
      totalNewCompetitors,
      totalSkipped,
      totalErrors,
      tendersProcessedThisJob,
      elapsedSeconds: elapsed,
    },
    'Proactive supplier scraping completed',
  )

  // Trigger downstream enrichment if we found new competitors
  if (totalNewCompetitors > 0) {
    const ts = Date.now()
    try {
      await competitionAnalysisQueue.add(
        `post-proactive-analysis-${ts}`,
        { mode: 'incremental' },
        { jobId: `post-proactive-analysis-${ts}` },
      )
      logger.info('Enqueued competition analysis after proactive supplier scraping')
    } catch (err) {
      logger.warn({ err }, 'Failed to enqueue competition analysis after proactive scraping')
    }

    try {
      await fornecedorEnrichmentQueue.add(
        `post-proactive-enrichment-${ts}`,
        { batch: 0 },
        { jobId: `post-proactive-enrichment-${ts}` },
      )
      logger.info('Enqueued fornecedor enrichment after proactive supplier scraping')
    } catch (err) {
      logger.warn({ err }, 'Failed to enqueue fornecedor enrichment after proactive scraping')
    }
  }
}

export const proactiveSupplierScrapingWorker = new Worker<ProactiveSupplierScrapingJobData>(
  'proactive-supplier-scraping',
  processProactiveSupplierScraping,
  {
    connection,
    concurrency: 1,
    stalledInterval: 600_000, // 10 min — long-running job
    lockDuration: 600_000,
  },
)

proactiveSupplierScrapingWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Proactive supplier scraping job completed')
})

proactiveSupplierScrapingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Proactive supplier scraping job failed')
})
