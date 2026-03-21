/**
 * In-memory sliding window rate limiter.
 *
 * Each Vercel serverless instance maintains its own rate limit state.
 * This is a best-effort rate limiter — it won't be globally consistent
 * across instances, but it provides reasonable protection against abuse
 * from a single user hitting the same instance.
 *
 * For true global rate limiting, consider Vercel's built-in WAF/rate limiting.
 */

interface WindowEntry {
  timestamps: number[]
}

const windows = new Map<string, WindowEntry>()

// Periodic cleanup
const CLEANUP_INTERVAL = 60_000
let cleanupTimer: ReturnType<typeof setInterval> | null = null

function ensureCleanup() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of windows) {
      // Remove entries older than 10 minutes (max reasonable window)
      entry.timestamps = entry.timestamps.filter((t) => now - t < 600_000)
      if (entry.timestamps.length === 0) {
        windows.delete(key)
      }
    }
    if (windows.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer)
      cleanupTimer = null
    }
  }, CLEANUP_INTERVAL)
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref()
  }
}

/**
 * Sliding window rate limiter.
 *
 * Returns { allowed: true } if within limit, or { allowed: false, retryAfter } if exceeded.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = Date.now()
  const windowMs = windowSeconds * 1000

  let entry = windows.get(key)
  if (!entry) {
    entry = { timestamps: [] }
    windows.set(key, entry)
    ensureCleanup()
  }

  // Remove expired entries
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs)

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0]
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000)
    return { allowed: false, retryAfter: Math.max(1, retryAfter) }
  }

  // Record this request
  entry.timestamps.push(now)

  return { allowed: true }
}
