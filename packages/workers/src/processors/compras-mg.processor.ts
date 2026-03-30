import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import { extractionQueue } from '../queues/extraction.queue'
import { type MGScrapingJobData } from '../queues/compras-mg.queue'
import { fetchMGPregoes, fetchMGConcorrencias, normalizeMGToTender } from '../scrapers/compras-mg-client'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'

/**
 * Processor for Portal de Compras MG (Minas Gerais) scraping.
 * Scrapes pregões eletrônicos and concorrências from the public listing.
 * Schedule: every 6 hours (lower frequency due to HTML scraping).
 */
async function processMGJob(job: Job<MGScrapingJobData>) {
  const tipo = job.data.tipo || 'all'

  try {
    const allLicitacoes = []

    if (tipo === 'all' || tipo === 'pregao') {
      const pregoes = await fetchMGPregoes()
      allLicitacoes.push(...pregoes)
    }

    if (tipo === 'all' || tipo === 'concorrencia') {
      const concorrencias = await fetchMGConcorrencias()
      allLicitacoes.push(...concorrencias)
    }

    let newCount = 0
    for (const lic of allLicitacoes) {
      try {
        const normalized = normalizeMGToTender(lic)

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
          logger.error({ error, pncpId: normalized.pncp_id }, 'Error inserting MG tender')
          continue
        }

        newCount++

        // Only enqueue extraction if object is substantial enough
        if (normalized.objeto && normalized.objeto.length > 20) {
          await extractionQueue.add(`extract-mg-${id}`, { tenderId: id })
        }
      } catch (err) {
        logger.error({ numero: lic.numero, err }, 'Error processing MG licitacao')
      }
    }

    logger.info(
      { tipo, found: allLicitacoes.length, new: newCount },
      'Portal MG scraping completed',
    )
  } catch (error) {
    logger.error({ tipo, error }, 'Portal MG scraping job failed')
    throw error
  }
}

export const mgScrapingWorker = new Worker<MGScrapingJobData>(
  'compras-mg',
  processMGJob,
  {
    connection,
    concurrency: 1,
  },
)

mgScrapingWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Portal MG scraping job completed')
})

mgScrapingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Portal MG scraping job failed')
})
