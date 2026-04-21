import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import { comprasgovScrapingQueue, type ComprasGovScrapingJobData } from '../queues/comprasgov-scraping.queue'
import { extractionQueue } from '../queues/extraction.queue'
import { fetchLicitacoes, normalizeToTender } from '../scrapers/comprasgov-client'
import { fetchDocumentos } from '../scrapers/pncp-client'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'

async function processComprasGovJob(job: Job<ComprasGovScrapingJobData>) {
  const { pagina, uf, modalidade, dataInicial, dataFinal } = job.data

  const jobRecord = await supabase
    .from('scraping_jobs')
    .insert({
      job_type: 'scrape',
      status: 'running',
      started_at: new Date().toISOString(),
      params: { ...job.data, source: 'comprasgov' },
    })
    .select('id')
    .single()

  if (jobRecord.error || !jobRecord.data) {
    logger.error({ error: jobRecord.error }, 'Failed to create comprasgov job record')
    throw new Error('Failed to create comprasgov job record')
  }

  const jobId = jobRecord.data.id

  try {
    const result = await fetchLicitacoes({
      pagina,
      uf,
      modalidade,
      dataInicial,
      dataFinal,
    })

    let newCount = 0
    for (const lic of result.data) {
      try {
        const normalized = normalizeToTender(lic)

        // Check if already exists (dedup by pncp_id)
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
          if (error.code === '23505') continue // Duplicate, skip
          logger.error({ error, pncpId: normalized.pncp_id }, 'Error inserting dadosabertos tender')
          continue
        }

        newCount++

        // Fetch documents from PNCP API (comprasgov tenders are also on PNCP)
        const cnpj = lic.orgaoEntidadeCnpj?.replace(/\D/g, '') || ''
        const ano = lic.anoCompraPncp
        const seq = lic.sequencialCompraPncp
        if (cnpj && ano && seq) {
          try {
            const docs = await fetchDocumentos(cnpj, ano, seq)
            for (const doc of docs) {
              await supabase.from('tender_documents').insert({
                tender_id: id,
                titulo: doc.titulo,
                tipo: doc.tipo,
                url: doc.url,
                status: 'pending',
              })
            }
            if (docs.length > 0) {
              logger.info({ tenderId: id, docCount: docs.length }, 'Fetched PNCP documents for comprasgov tender')
            }
          } catch (docErr) {
            logger.warn({ tenderId: id, cnpj, ano, seq, docErr }, 'Failed to fetch PNCP docs for comprasgov tender')
          }
        }

        // Enqueue extraction for the new tender (will process downloaded PDFs)
        await extractionQueue.add(`extract-cg-${id}`, { tenderId: id })
      } catch (err) {
        logger.error(
          { objeto: lic.objetoCompra?.slice(0, 80), err },
          'Error processing dadosabertos contratacao',
        )
      }
    }

    // Auto-paginate if there are more results
    if (result.hasMore) {
      await comprasgovScrapingQueue.add('comprasgov-next', {
        pagina: (pagina || 1) + 1,
        uf,
        modalidade,
        dataInicial,
        dataFinal,
      })
    }

    const { error: updateErr } = await supabase
      .from('scraping_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result: {
          totalFound: result.data.length,
          newTenders: newCount,
          hasMore: result.hasMore,
          totalRecords: result.total,
          source: 'comprasgov',
        },
      })
      .eq('id', jobId)

    if (updateErr) logger.error({ error: updateErr }, 'Failed to update comprasgov job as completed')

    logger.info(
      { pagina, found: result.data.length, new: newCount, total: result.total, source: 'comprasgov' },
      'dadosabertos scraping page completed',
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
    if (failErr) logger.error({ error: failErr }, 'Failed to update comprasgov job as failed')
    throw error
  }
}

export const comprasgovScrapingWorker = new Worker<ComprasGovScrapingJobData>(
  'comprasgov-scraping',
  processComprasGovJob,
  {
    connection,
    concurrency: 1, // Respect rate limits
    lockDuration: 600_000,
    stalledInterval: 600_000,
  },
)

comprasgovScrapingWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'dadosabertos scraping job completed')
})

comprasgovScrapingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'dadosabertos scraping job failed')
})
