import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import type { BecSpScrapingJobData } from '../queues/bec-sp-scraping.queue'
import { extractionQueue } from '../queues/extraction.queue'
import {
  fetchBecPregoes,
  fetchBecDispensas,
  fetchBecOfertas,
  normalizeBecToTender,
} from '../scrapers/bec-sp-client'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'

async function processBecSpJob(job: Job<BecSpScrapingJobData>) {
  const { tipo } = job.data

  const jobRecord = await supabase
    .from('scraping_jobs')
    .insert({
      job_type: 'scrape',
      status: 'running',
      started_at: new Date().toISOString(),
      params: { tipo, source: 'bec_sp' },
    })
    .select('id')
    .single()

  if (jobRecord.error || !jobRecord.data) {
    logger.error({ error: jobRecord.error }, 'Failed to create BEC SP job record')
    throw new Error('Failed to create BEC SP job record')
  }

  const jobId = jobRecord.data.id

  try {
    // Fetch based on tipo
    const licitacoes =
      tipo === 'pregao'
        ? await fetchBecPregoes()
        : tipo === 'dispensa'
          ? await fetchBecDispensas()
          : await fetchBecOfertas()

    let newCount = 0
    for (const lic of licitacoes) {
      try {
        const normalized = normalizeBecToTender(lic)

        // Check dedup
        const { data: existing } = await supabase
          .from('tenders')
          .select('id')
          .eq('pncp_id', normalized.pncp_id)
          .single()

        if (existing) continue

        const id = crypto.randomUUID()
        const { error } = await supabase.from('tenders').insert({
          id,
          ...normalized,
        })

        if (error) {
          if (error.code === '23505') continue
          logger.error({ error, pncpId: normalized.pncp_id }, 'Error inserting BEC SP tender')
          continue
        }

        newCount++
        // Enqueue extraction (even without docs, will trigger matching after)
        await extractionQueue.add(`extract-bec-${id}`, { tenderId: id })
      } catch (err) {
        logger.error({ lic: lic.objeto?.slice(0, 80), err }, 'Error processing BEC SP licitacao')
      }
    }

    const { error: updateErr } = await supabase
      .from('scraping_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result: { totalFound: licitacoes.length, newTenders: newCount, tipo, source: 'bec_sp' },
      })
      .eq('id', jobId)

    if (updateErr) logger.error({ error: updateErr }, 'Failed to update BEC SP job as completed')

    logger.info(
      { tipo, found: licitacoes.length, new: newCount, source: 'bec_sp' },
      'BEC SP scraping completed',
    )
  } catch (error) {
    const { error: failErr } = await supabase
      .from('scraping_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: String(error),
      })
      .eq('id', jobId)
    if (failErr) logger.error({ error: failErr }, 'Failed to update BEC SP job as failed')
    throw error
  }
}

export const becSpScrapingWorker = new Worker<BecSpScrapingJobData>(
  'bec-sp-scraping',
  processBecSpJob,
  {
    connection,
    concurrency: 1,
    lockDuration: 600_000,
    stalledInterval: 600_000,
  },
)

becSpScrapingWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'BEC SP scraping job completed')
})

becSpScrapingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'BEC SP scraping job failed')
})
