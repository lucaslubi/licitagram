import IORedis from 'ioredis'
import type { ConnectionOptions } from 'bullmq'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

const redis = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  ...(redisUrl.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
  retryStrategy(times) {
    return Math.min(times * 200, 10_000)
  },
})

export const connection = redis as unknown as ConnectionOptions

/**
 * RI-6: EVERY queue created in gov-workers MUST carry this prefix so that
 * Redis keys never collide with `packages/workers` or any other tenant.
 * Do not import Queue/Worker directly from 'bullmq' elsewhere — use the
 * helpers in queues.ts.
 */
export const GOV_QUEUE_PREFIX = 'licitagov'
