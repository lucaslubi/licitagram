import Redis from 'ioredis'

const redisUrl = process.env.REDIS_URL
let redis: Redis | null = null

export function getRedisClient(): Redis | null {
  if (!redisUrl) return null
  if (!redis) {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 2000,
      commandTimeout: 2000,
    })
    redis.on('error', (err) => {
      console.error('Redis error:', err.message)
    })
  }
  return redis
}
