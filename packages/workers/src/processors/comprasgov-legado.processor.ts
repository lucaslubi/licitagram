import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import { extractionQueue } from '../queues/extraction.queue'
import { legadoScrapingQueue, type LegadoScrapingJobData } from '../queues/comprasgov-legado.queue'
import { fetchPregoesLegado, normalizePregaoLegadoToTender } from '../scrapers/comprasgov-client'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'

/**
 * Processor for legacy pregões (Lei 8.666) from dadosabertos module 06.
 * Volume is declining as Lei 14.133 replaces the old procurement law,
 * but there are still active legacy processes in the system.
 */
async function processLegadoJob(job: Job<LegadoScrapingJobData>) {
  const { pagina = 1 } = job.data

  // Fetch pregões published in the last 60 days
  const today = new Date()
  const sixtyDaysAgo = new Date()
  sixtyDaysAgo.setDate(today.getDate() - 60)

  const dataInicial = sixtyDaysAgo.toISOString().split('T')[0]
  const dataFinal = today.toISOString().split('T')[0]

  try {
    const result = await fetchPregoesLegado({
      dataInicial,
      dataFinal,
      pagina,
    })

    let newCount = 0
    for (const pregao of result.data) {
      try {
        const normalized = normalizePregaoLegadoToTender(pregao)

        // Dedup by pncp_id
        const { data: existing } = await supabase
          .from('tenders')
          .select('id')
          .eq('pncp_id', normalized.pncp_id)
          .single()

        if (existing) continue

        const id = crypto.randomUUID()
        const { error } = await supabase.from('tenders').insert({ id, ...normalized })

        if (error) {
          if (error.code === '23505') continue
          logger.error({ error, pncpId: normalized.pncp_id }, 'Error inserting legacy tender')
          continue
        }

        newCount++
        await extractionQueue.add(`extract-leg-${id}`, { tenderId: id })
      } catch (err) {
        logger.error({ pregao: pregao.numero, err }, 'Error processing legacy pregao')
      }
    }

    // Auto-paginate
    if (result.hasMore && pagina < 10) {
      await legadoScrapingQueue.add('legado-next', { pagina: pagina + 1 })
    }

    logger.info(
      { pagina, found: result.data.length, new: newCount, total: result.total },
      'Legacy pregoes scraping page completed',
    )
  } catch (error) {
    logger.error({ pagina, error }, 'Legacy pregoes scraping job failed')
    throw error
  }
}

export const legadoScrapingWorker = new Worker<LegadoScrapingJobData>(
  'comprasgov-legado',
  processLegadoJob,
  {
    connection,
    concurrency: 1,
  },
)

legadoScrapingWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Legacy pregoes scraping job completed')
})

legadoScrapingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Legacy pregoes scraping job failed')
})
