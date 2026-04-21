import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { type MatchingJobData } from '../queues/matching.queue'
import { logger } from '../lib/logger'

/**
 * Matching worker — AI matching is now ON-DEMAND only.
 * This worker drains any leftover jobs in the queue without calling AI.
 * New matches are created by keyword-matcher.ts (free, no tokens).
 * AI analysis happens via /api/analyze when user views a match.
 */
const matchingWorker = new Worker<MatchingJobData>(
  'matching',
  async (job) => {
    logger.info(
      { companyId: job.data.companyId, tenderId: job.data.tenderId },
      'Matching job skipped — AI matching is now on-demand only',
    )
    // No-op: just drain the queue without calling AI
  },
  {
    connection,
    concurrency: 5,
    lockDuration: 600_000,
    stalledInterval: 600_000,
  },
)

matchingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Matching job failed')
})

export { matchingWorker }
