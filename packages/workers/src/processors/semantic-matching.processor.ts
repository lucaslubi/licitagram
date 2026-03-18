/**
 * Semantic Matching Worker — processes semantic matching jobs per company
 */

import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { type SemanticMatchingJobData } from '../queues/semantic-matching.queue'
import { logger } from '../lib/logger'
import { runSemanticMatching } from './semantic-matcher'

const semanticMatchingWorker = new Worker<SemanticMatchingJobData>(
  'semantic-matching',
  async (job) => {
    const { companyId } = job.data

    if (!process.env.JINA_API_KEY && !process.env.OPENAI_API_KEY) {
      logger.warn('No embedding provider configured (JINA_API_KEY or OPENAI_API_KEY) — skipping semantic matching')
      return
    }

    logger.info({ companyId }, 'Starting semantic matching job')
    const stats = await runSemanticMatching(companyId)
    logger.info({ companyId, ...stats }, 'Semantic matching job complete')
  },
  {
    connection,
    concurrency: 1,
    limiter: { max: 5, duration: 60_000 },
    stalledInterval: 600_000, // 10 min stall timeout (embedding can be slow)
    lockDuration: 300_000, // 5 min lock
  },
)

semanticMatchingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Semantic matching job failed')
})

export { semanticMatchingWorker }
