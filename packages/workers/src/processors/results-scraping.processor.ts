import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import type { ResultsScrapingJobData } from '../queues/results-scraping.queue'
import { fetchTenderResults } from '../scrapers/pncp-results-client'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'
import { competitionAnalysisQueue } from '../queues/competition-analysis.queue'
import { fornecedorEnrichmentQueue } from '../queues/fornecedor-enrichment.queue'

const BATCH_SIZE = 100
const MAX_BATCHES = 500 // Safety: max 50k tenders per run
const PARALLEL_TENDERS = 5 // Process 5 tenders concurrently

async function processResultsJob(job: Job<ResultsScrapingJobData>) {
  const startBatch = job.data.batch || 0

  let totalResults = 0
  let totalTendersProcessed = 0
  let totalSkipped = 0
  let consecutiveEmpty = 0

  for (let batch = startBatch; batch < startBatch + MAX_BATCHES; batch++) {
    // Find tenders that have been analyzed from PNCP or dadosabertos
    // Use LEFT JOIN approach: only fetch tenders WITHOUT competitors
    const { data: tenders } = await supabase
      .from('tenders')
      .select('id, pncp_id')
      .eq('status', 'analyzed')
      .in('source', ['pncp', 'comprasgov'])
      .not('pncp_id', 'is', null)
      .order('created_at', { ascending: false })
      .range(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE - 1)

    if (!tenders || tenders.length === 0) {
      logger.info({ batch, totalResults, totalTendersProcessed }, 'No more tenders — results scraping complete')
      break
    }

    // Batch-check which tenders already have competitors (single query instead of N queries)
    const tenderIds = tenders.map((t: { id: string; pncp_id: string | null }) => t.id)
    const { data: existingCompetitors } = await supabase
      .from('competitors')
      .select('tender_id')
      .in('tender_id', tenderIds)

    const tendersWithCompetitors = new Set(
      (existingCompetitors || []).map((c: { tender_id: string }) => c.tender_id),
    )
    const tendersToProcess = tenders.filter(
      (t: { id: string; pncp_id: string | null }) => !tendersWithCompetitors.has(t.id),
    )

    totalSkipped += tenders.length - tendersToProcess.length

    if (tendersToProcess.length === 0) {
      totalTendersProcessed += tenders.length
      consecutiveEmpty++
      if (consecutiveEmpty >= 10) {
        logger.info({ batch, consecutiveEmpty }, 'Stopping early — no new results in recent batches')
        break
      }
      continue
    }

    let batchResults = 0

    // Process tenders in parallel chunks of PARALLEL_TENDERS
    for (let i = 0; i < tendersToProcess.length; i += PARALLEL_TENDERS) {
      const chunk = tendersToProcess.slice(i, i + PARALLEL_TENDERS)

      const results = await Promise.allSettled(
        chunk.map(async (tender: { id: string; pncp_id: string | null }) => {
          const competitorResults = await fetchTenderResults(tender.pncp_id!)
          if (competitorResults.length === 0) return 0

          // Insert competitors
          const rows = competitorResults.map((r) => {
            let situacao = r.situacao
            if (r.vencedor && situacao.toLowerCase() === 'informado') {
              situacao = 'Homologado'
            }
            return {
              tender_id: tender.id,
              cnpj: r.cnpj,
              nome: r.nome,
              valor_proposta: r.valor_proposta ?? r.valor_final,
              situacao,
            }
          })

          const { error } = await supabase.from('competitors').insert(rows)
          if (error) {
            logger.error({ error, tenderId: tender.id }, 'Error inserting competitors')
            return 0
          }

          return competitorResults.length
        }),
      )

      for (const result of results) {
        if (result.status === 'fulfilled') {
          batchResults += result.value
        } else {
          logger.error({ err: result.reason }, 'Error processing tender results')
        }
      }

      // Brief pause between parallel chunks to respect API
      await new Promise((r) => setTimeout(r, 300))
    }

    totalResults += batchResults
    totalTendersProcessed += tenders.length

    // Track consecutive empty batches to stop early
    if (batchResults === 0) {
      consecutiveEmpty++
      if (consecutiveEmpty >= 10) {
        logger.info({ batch, consecutiveEmpty }, 'Stopping early — no new results in recent batches')
        break
      }
    } else {
      consecutiveEmpty = 0
    }

    // Log progress every 3 batches
    if (batch % 3 === 0) {
      logger.info(
        { batch, totalResults, totalTendersProcessed, totalSkipped },
        'Results scraping progress',
      )
      await job.updateProgress(batch)
    }
  }

  logger.info(
    { totalResults, totalTendersProcessed, totalSkipped },
    'Results scraping completed',
  )

  // Trigger materialization + enrichment after scraping
  if (totalResults > 0) {
    const ts = Date.now()
    await competitionAnalysisQueue.add(
      `post-results-analysis-${ts}`,
      { mode: 'incremental' },
      { jobId: `post-results-analysis-${ts}` },
    )
    logger.info('Enqueued competition analysis after results scraping')

    await fornecedorEnrichmentQueue.add(
      `post-results-enrichment-${ts}`,
      { batch: 0 },
      { jobId: `post-results-enrichment-${ts}` },
    )
    logger.info('Enqueued fornecedor enrichment after results scraping')
  }
}

export const resultsScrapingWorker = new Worker<ResultsScrapingJobData>(
  'results-scraping',
  processResultsJob,
  {
    connection,
    concurrency: 1,
    stalledInterval: 600_000, // 10 min — long-running job
    lockDuration: 600_000,
  },
)

resultsScrapingWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Results scraping job completed')
})

resultsScrapingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Results scraping job failed')
})
