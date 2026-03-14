import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { type ExtractionJobData } from '../queues/extraction.queue'
import { extractTextFromPDF } from '../scrapers/pdf-extractor'
import { runKeywordMatching } from './keyword-matcher'
import { classifyTenderCNAEs } from '../ai/cnae-classifier'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { invalidateTenderCaches, invalidateTenderDetail, incrementStat } from '../lib/redis-cache'

const extractionWorker = new Worker<ExtractionJobData>(
  'extraction',
  async (job) => {
    const { tenderId } = job.data
    logger.info({ tenderId }, 'Starting extraction')

    // 1. Fetch pending documents for this tender
    const { data: docs, error: docsErr } = await supabase
      .from('tender_documents')
      .select('id, url')
      .eq('tender_id', tenderId)
      .eq('status', 'pending')

    if (docsErr) {
      logger.error({ tenderId, error: docsErr }, 'Failed to fetch tender documents')
    }

    // 2. Extract text from each PDF (free, no AI tokens)
    for (const doc of docs || []) {
      try {
        const text = await extractTextFromPDF(doc.url)
        await supabase
          .from('tender_documents')
          .update({ texto_extraido: text, status: 'done' })
          .eq('id', doc.id)
      } catch (err) {
        logger.error({ docId: doc.id, err }, 'PDF extraction failed')
        await supabase
          .from('tender_documents')
          .update({ status: 'error' })
          .eq('id', doc.id)
      }
    }

    // 3. Mark tender as analyzed (AI analysis is now on-demand when user clicks)
    const { error: statusErr } = await supabase
      .from('tenders')
      .update({ status: 'analyzed' })
      .eq('id', tenderId)

    if (statusErr) {
      logger.error({ tenderId, error: statusErr }, 'Failed to mark tender as analyzed')
    }

    // 4. Classify tender CNAEs (AI-powered, uses Gemini Flash Lite)
    try {
      await classifyTenderCNAEs(tenderId)
    } catch (err) {
      logger.warn({ tenderId, err }, 'CNAE classification failed (will retry in sweep)')
    }

    // 5. Run CNAE-first keyword matching
    try {
      await runKeywordMatching(tenderId)
    } catch (err) {
      logger.warn({ tenderId, err }, 'Keyword matching failed')
    }

    // 6. Invalidate caches so web app sees fresh data
    await invalidateTenderDetail(tenderId)
    await invalidateTenderCaches()
    await incrementStat('extractions-today')

    logger.info({ tenderId }, 'Extraction complete (PDF text + CNAE classification + CNAE-first matching)')
  },
  {
    connection,
    concurrency: 2,
    limiter: { max: 10, duration: 60_000 },
    stalledInterval: 180_000,
  },
)

extractionWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Extraction job failed')
})

export { extractionWorker }
