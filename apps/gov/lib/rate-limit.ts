import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

interface LimitResult {
  success: boolean
  remaining: number
  reset: number
}

let limiter: Ratelimit | null = null

function getLimiter(): Ratelimit | null {
  if (limiter) return limiter
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  const redis = new Redis({ url, token })
  limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '60 s'),
    analytics: true,
    prefix: 'licitagov:rl:auth',
  })
  return limiter
}

/**
 * 5 requests per 60s per identifier (typically `${action}:${ip}`).
 * Falls back to "always allow" when Upstash env vars are missing — useful in
 * local dev where you don't want to set up Redis just to log in. Production
 * MUST have UPSTASH_REDIS_REST_URL/TOKEN configured.
 */
export async function authRateLimit(identifier: string): Promise<LimitResult> {
  const l = getLimiter()
  if (!l) {
    if (process.env.NODE_ENV === 'production') {
      // eslint-disable-next-line no-console
      console.warn('[rate-limit] Upstash env vars missing in production — auth endpoints unprotected!')
    }
    return { success: true, remaining: 999, reset: Date.now() + 60_000 }
  }
  const { success, remaining, reset } = await l.limit(identifier)
  return { success, remaining, reset }
}
