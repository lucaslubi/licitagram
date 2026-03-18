import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import type { ResultsScrapingJobData } from '../queues/results-scraping.queue'
import { fetchTenderResults } from '../scrapers/pncp-results-client'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { competitionAnalysisQueue } from '../queues/competition-analysis.queue'
import { fornecedorEnrichmentQueue } from '../queues/fornecedor-enrichment.queue'

const BATCH_SIZE = 50
const MAX_BATCHES = 500 // Safety: max 25k tenders per run

async function processResultsJob(job: Job<ResultsScrapingJobData>) {
  const startBatch = job.data.batch || 0

  let totalResults = 0
  let totalTendersProcessed = 0
  let totalSkipped = 0
  let consecutiveEmpty = 0

  for (let batch = startBatch; batch < startBatch + MAX_BATCHES; batch++) {
    // Find tenders that have been analyzed from PNCP or dadosabertos
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

    let batchResults = 0

    for (const tender of tenders) {
      try {
        // Check if we already have competitors for this tender
        const { count } = await supabase
          .from('competitors')
          .select('id', { count: 'exact', head: true })
          .eq('tender_id', tender.id)

        if (count && count > 0) {
          totalSkipped++
          continue
        }

        const results = await fetchTenderResults(tender.pncp_id!)

        if (results.length === 0) continue

        // Insert competitors
        const rows = results.map((r) => {
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

        batchResults += results.length

        // Rate limit
        await new Promise((r) => setTimeout(r, 800))
      } catch (err) {
        logger.error({ tenderId: tender.id, err }, 'Error fetching results for tender')
      }
    }

    totalResults += batchResults
    totalTendersProcessed += tenders.length

    // Track consecutive empty batches to stop early
    if (batchResults === 0) {
      consecutiveEmpty++
      // If 5 consecutive batches with no new results, likely all done
      if (consecutiveEmpty >= 5) {
        logger.info({ batch, consecutiveEmpty }, 'Stopping early — no new results in recent batches')
        break
      }
    } else {
      consecutiveEmpty = 0
    }

    // Log progress every 5 batches
    if (batch % 5 === 0) {
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
    stalledInterval: 300_000,
    lockDuration: 300_000,
  },
)

resultsScrapingWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Results scraping job completed')
})

resultsScrapingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Results scraping job failed')
})
