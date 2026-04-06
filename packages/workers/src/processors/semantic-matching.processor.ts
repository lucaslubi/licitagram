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

    // Ollama/BGE-M3 is always available locally — no API key check needed
    // Cloud providers (Voyage, Jina, OpenAI) are used as fallback if Ollama fails

    logger.info({ companyId }, 'Starting semantic matching job')
    const stats = await runSemanticMatching(companyId)
    logger.info({ companyId, ...stats }, 'Semantic matching job complete')
  },
  {
    connection,
    concurrency: 15,
    limiter: { max: 60, duration: 60_000 },
    stalledInterval: 600_000, // 10 min stall timeout (embedding can be slow)
    lockDuration: 300_000, // 5 min lock
  },
)

semanticMatchingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Semantic matching job failed')
})

export { semanticMatchingWorker }
