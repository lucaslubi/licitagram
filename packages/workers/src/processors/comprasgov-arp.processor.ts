import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import { extractionQueue } from '../queues/extraction.queue'
import { arpScrapingQueue, type ARPScrapingJobData } from '../queues/comprasgov-arp.queue'
import { fetchARP, normalizeARPToTender } from '../scrapers/comprasgov-client'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'

/**
 * Processor for ARP (Atas de Registro de Preço) from dadosabertos.
 * These are pre-negotiated price agreements that companies can piggyback on.
 * Runs separately due to the slow API response times (~22s per page).
 */
async function processARPJob(job: Job<ARPScrapingJobData>) {
  const { pagina = 1 } = job.data

  // Fetch ARPs with vigência starting in the last 90 days
  const today = new Date()
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(today.getDate() - 90)

  const dateMin = ninetyDaysAgo.toISOString().split('T')[0]
  const dateMax = today.toISOString().split('T')[0]

  try {
    const result = await fetchARP({
      dataVigenciaInicialMin: dateMin,
      dataVigenciaInicialMax: dateMax,
      pagina,
    })

    let newCount = 0
    for (const arp of result.data) {
      if (arp.ataExcluido) continue // Skip deleted ARPs

      try {
        const normalized = normalizeARPToTender(arp)

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
          if (error.code === '23505') continue // Duplicate
          logger.error({ error, pncpId: normalized.pncp_id }, 'Error inserting ARP tender')
          continue
        }

        newCount++

        // Only enqueue extraction if ARP has enough info for matching
        if (normalized.objeto && normalized.objeto.length > 20) {
          await extractionQueue.add(`extract-arp-${id}`, { tenderId: id })
        }
      } catch (err) {
        logger.error({ arp: arp.numeroAtaRegistroPreco, err }, 'Error processing ARP')
      }
    }

    // Auto-paginate (max 5 pages to avoid slow API overload)
    if (result.hasMore && pagina < 5) {
      await arpScrapingQueue.add('arp-next', { pagina: pagina + 1 })
    }

    logger.info(
      { pagina, found: result.data.length, new: newCount, total: result.total },
      'ARP scraping page completed',
    )
  } catch (error) {
    logger.error({ pagina, error }, 'ARP scraping job failed')
    throw error
  }
}

export const arpScrapingWorker = new Worker<ARPScrapingJobData>(
  'comprasgov-arp',
  processARPJob,
  {
    connection,
    concurrency: 1,
    lockDuration: 600_000,
    stalledInterval: 600_000,
  },
)

arpScrapingWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'ARP scraping job completed')
})

arpScrapingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'ARP scraping job failed')
})
