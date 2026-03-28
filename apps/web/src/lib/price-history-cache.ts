import type { CacheAdapter } from '@licitagram/price-history'
import { getRedisClient } from './redis-client'

/**
 * Redis-backed CacheAdapter for the price-history module.
 * All operations silently fall back to null/void on error,
 * so the app works 100% without Redis.
 */
export class RedisCacheAdapter implements CacheAdapter {
  private prefix = 'ph:'

  async get<T>(key: string): Promise<T | null> {
    try {
      const redis = getRedisClient()
      if (!redis) return null
      const raw = await redis.get(this.prefix + key)
      if (!raw) return null
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    try {
      const redis = getRedisClient()
      if (!redis) return
      await redis.setex(this.prefix + key, ttl, JSON.stringify(value))
    } catch {
      // silent fallback
    }
  }

  async del(key: string): Promise<void> {
    try {
      const redis = getRedisClient()
      if (!redis) return
      await redis.del(this.prefix + key)
    } catch {
      // silent fallback
    }
  }
}

// Singleton
let adapter: RedisCacheAdapter | null = null
export function getPriceHistoryCacheAdapter(): RedisCacheAdapter {
  if (!adapter) adapter = new RedisCacheAdapter()
  return adapter
}

/**
 * Redis-backed rate limiter.
 * Uses INCR + EXPIRE for sliding window.
 * Falls back to allowing requests if Redis is unavailable.
 */
export async function checkRedisRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    const redis = getRedisClient()
    if (!redis) return { allowed: true } // no Redis = no rate limit

    const fullKey = `ph:rl:${key}`
    const count = await redis.incr(fullKey)

    if (count === 1) {
      // First request in this window — set expiry
      await redis.expire(fullKey, windowSeconds)
    }

    if (count > maxRequests) {
      const ttl = await redis.ttl(fullKey)
      return { allowed: false, retryAfter: Math.max(1, ttl) }
    }

    return { allowed: true }
  } catch {
    // Redis error — allow request
    return { allowed: true }
  }
}
