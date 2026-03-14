import { getRedis } from './redis'

/**
 * Sliding window rate limiter using Redis.
 *
 * Returns { allowed: true } if within limit, or { allowed: false, retryAfter } if exceeded.
 * Falls through (allows) if Redis is unavailable.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    const redis = getRedis()
    const now = Date.now()
    const windowMs = windowSeconds * 1000
    const windowStart = now - windowMs

    const redisKey = `ratelimit:${key}`

    // Use a pipeline for atomicity
    const pipeline = redis.pipeline()
    // Remove expired entries
    pipeline.zremrangebyscore(redisKey, 0, windowStart)
    // Add current request
    pipeline.zadd(redisKey, now, `${now}:${Math.random()}`)
    // Count requests in window
    pipeline.zcard(redisKey)
    // Set TTL so the key auto-cleans
    pipeline.expire(redisKey, windowSeconds + 1)

    const results = await pipeline.exec()
    if (!results) return { allowed: true }

    const count = (results[2]?.[1] as number) || 0

    if (count > maxRequests) {
      // Find oldest entry to calculate retry-after
      const oldest = await redis.zrange(redisKey, 0, 0, 'WITHSCORES')
      const oldestTime = oldest.length >= 2 ? parseInt(oldest[1], 10) : now
      const retryAfter = Math.ceil((oldestTime + windowMs - now) / 1000)
      return { allowed: false, retryAfter: Math.max(1, retryAfter) }
    }

    return { allowed: true }
  } catch {
    // Redis unavailable — allow request (fail-open)
    return { allowed: true }
  }
}
