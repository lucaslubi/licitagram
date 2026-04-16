/**
 * Producer helpers for the Licitagram Supreme Bot — web side.
 *
 * Thin wrapper around the BullMQ `bot-session-execute` queue, so the
 * Next.js app can enqueue jobs without importing the worker package.
 *
 * Lazy Redis connection (module-level so subsequent calls reuse it).
 */

import IORedis from 'ioredis'
import { Queue } from 'bullmq'

const QUEUE_NAME = 'bot-session-execute'

let _queue: Queue<{ sessionId: string; source: string }> | null = null

function getQueue(): Queue<{ sessionId: string; source: string }> {
  if (_queue) return _queue
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    throw new Error('REDIS_URL env var is required to enqueue bot jobs')
  }
  const redis = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    ...(redisUrl.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
  })
  _queue = new Queue(QUEUE_NAME, {
    connection: redis as unknown as import('bullmq').ConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { count: 500, age: 24 * 3600 },
      removeOnFail: { count: 1000, age: 7 * 24 * 3600 },
    },
  })
  return _queue
}

/**
 * Enqueue a bot session for execution. Idempotent: if a job for this
 * session already exists, BullMQ dedupes by jobId.
 */
export async function enqueueBotSession(
  sessionId: string,
  source: 'initial' | 'resume' | 'watchdog' | 'manual' = 'initial',
  delayMs = 0,
): Promise<void> {
  const q = getQueue()
  await q.add(
    'execute',
    { sessionId, source },
    { jobId: `session-${sessionId}`, delay: delayMs },
  )
}
