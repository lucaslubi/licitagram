import IORedis from 'ioredis'
import type { ConnectionOptions } from 'bullmq'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

const redis = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  // Upstash / managed Redis: enable TLS when using rediss:// protocol
  ...(redisUrl.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
  // Reconnection: exponential backoff up to 10s
  retryStrategy(times) {
    return Math.min(times * 200, 10_000)
  },
})

// Cast needed due to ioredis version mismatch between direct dep and bullmq's bundled version
export const connection = redis as unknown as ConnectionOptions
