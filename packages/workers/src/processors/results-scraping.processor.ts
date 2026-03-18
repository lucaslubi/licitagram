import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import type { ResultsScrapingJobData } from '../queues/results-scraping.queue'
import { fetchTenderResults } from '../scrapers/pncp-results-client'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { competitionAnalysisQueue } from '../queues/competition-analysis.queue'
import { fornecedorEnrichmentQueue } from '../queues/fornecedor-enrichment.queue'

const BATCH_SIZE = 20

async function processResultsJob(job: Job<ResultsScrapingJobData>) {
  const { batch } = job.data

  // Find tenders that have been analyzed from PNCP or dadosabertos
  // (both have real pncp_ids that can be looked up for results)
  const { data: tenders } = await supabase
    .from('tenders')
    .select('id, pncp_id')
    .eq('status', 'analyzed')
    .in('source', ['pncp', 'comprasgov'])
    .not('pncp_id', 'is', null)
    .order('created_at', { ascending: false })
    .range(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE - 1)

  if (!tenders || tenders.length === 0) {
    logger.info({ batch }, 'No more tenders to fetch results for')
    return
  }

  let totalResults = 0

  for (const tender of tenders) {
    try {
      // Check if we already have competitors for this tender
      const { count } = await supabase
        .from('competitors')
        .select('id', { count: 'exact', head: true })
        .eq('tender_id', tender.id)

      if (count && count > 0) continue

      const results = await fetchTenderResults(tender.pncp_id!)

      if (results.length === 0) continue

      // Insert competitors. Map PNCP status to what materialize_competitor_stats expects:
      // The RPC checks situacao ILIKE '%homologad%' to detect winners
      const rows = results.map((r) => {
        // PNCP uses "Informado" for winning results — normalize to "Homologado"
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
        continue
      }

      totalResults += results.length

      // Rate limit
      await new Promise((r) => setTimeout(r, 1000))
    } catch (err) {
      logger.error({ tenderId: tender.id, err }, 'Error fetching results for tender')
    }
  }

  logger.info(
    { batch, tendersProcessed: tenders.length, competitorsFound: totalResults },
    'Results scraping batch completed',
  )

  // Trigger incremental competition analysis after new results are scraped
  if (totalResults > 0) {
    const ts = Date.now()
    await competitionAnalysisQueue.add(
      `post-results-analysis-${ts}`,
      { mode: 'incremental' },
      { jobId: `post-results-analysis-${ts}` },
    )
    logger.info('Enqueued competition analysis after results scraping')

    // Also trigger fornecedor enrichment for the new competitors
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
  },
)

resultsScrapingWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Results scraping job completed')
})

resultsScrapingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Results scraping job failed')
})
