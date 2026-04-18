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
 *
 * Fails OPEN on any error (missing env, network blip, bad credentials, etc.)
 * Rationale: a misconfigured rate limit should not brick login/signup — that
 * would be a much worse outcome than a brief window without rate limiting.
 * Failures are logged so they surface in Vercel/Sentry for follow-up.
 */
export async function authRateLimit(identifier: string): Promise<LimitResult> {
  try {
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
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[rate-limit] Upstash error — failing open:', err)
    return { success: true, remaining: 999, reset: Date.now() + 60_000 }
  }
}
