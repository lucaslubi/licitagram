import IORedis from 'ioredis'
import type { ConnectionOptions } from 'bullmq'

const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

// Cast needed due to ioredis version mismatch between direct dep and bullmq's bundled version
export const connection = redis as unknown as ConnectionOptions
