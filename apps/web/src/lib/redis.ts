/**
 * In-memory cache layer for the web app.
 *
 * Replaces the previous Redis/ioredis dependency with a simple Map+TTL cache.
 * On Vercel serverless, this cache lives for the duration of the warm instance
 * (typically 5-15 minutes), which aligns well with the short TTLs used.
 *
 * Benefits:
 * - Zero external dependency (no Upstash/Redis costs)
 * - Zero latency (no network round-trip)
 * - Graceful: cache misses just hit Supabase directly
 *
 * Trade-off: cache is per-instance, not shared across Vercel functions.
 * This is acceptable because:
 * - TTLs are short (1-10 min)
 * - The app already handled Redis being unavailable gracefully
 * - Supabase can handle the direct query load
 */

interface CacheEntry<T = unknown> {
  value: T
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

// Periodic cleanup to prevent memory leaks in long-lived instances
const CLEANUP_INTERVAL = 60_000 // 1 minute
let cleanupTimer: ReturnType<typeof setInterval> | null = null

function ensureCleanup() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) {
        cache.delete(key)
      }
    }
    // If cache is empty, stop the timer
    if (cache.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer)
      cleanupTimer = null
    }
  }, CLEANUP_INTERVAL)
  // Don't block Node.js from exiting
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref()
  }
}

// ─── Public API (same interface as before) ──────────────────────────────────

const DEFAULT_TTL = 300 // 5 minutes
const TENDER_DETAIL_TTL = 1800 // 30 minutes
const STATS_TTL = 600 // 10 minutes

/**
 * Get a cached value, or compute and cache it.
 * Uses in-memory Map with TTL expiration.
 */
export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number = DEFAULT_TTL,
): Promise<T> {
  const now = Date.now()
  const entry = cache.get(key)

  if (entry && entry.expiresAt > now) {
    return entry.value as T
  }

  const result = await fn()

  cache.set(key, {
    value: result,
    expiresAt: now + ttl * 1000,
  })
  ensureCleanup()

  return result
}

/**
 * Invalidate cache keys by pattern (supports * glob at the end).
 */
export async function invalidateCache(pattern: string): Promise<number> {
  if (!pattern.includes('*')) {
    // Exact key
    const deleted = cache.has(pattern) ? 1 : 0
    cache.delete(pattern)
    return deleted
  }

  // Glob pattern: "cache:tenders:*" → prefix match
  const prefix = pattern.replace(/\*+$/, '')
  let count = 0
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key)
      count++
    }
  }
  return count
}

/**
 * Invalidate a specific cache key.
 */
export async function invalidateKey(key: string): Promise<void> {
  cache.delete(key)
}

// ─── Cache Key Builders ──────────────────────────────────────────────────────

export const CacheKeys = {
  /** Global tender list by filter hash */
  tenderList: (filterHash: string) => `cache:tenders:list:${filterHash}`,

  /** Global tender count by filter hash */
  tenderCount: (filterHash: string) => `cache:tenders:count:${filterHash}`,

  /** Single tender detail */
  tenderDetail: (id: string) => `cache:tender:${id}`,

  /** Tender documents for a tender */
  tenderDocs: (tenderId: string) => `cache:tender:${tenderId}:docs`,

  /** Global stats (total tenders, by uf, by source, etc.) */
  stats: (key: string) => `cache:stats:${key}`,

  /** Company matches list (per-company, personalized) */
  matchList: (companyId: string, filterHash: string) => `cache:matches:${companyId}:${filterHash}`,

  /** Match count for a company */
  matchCount: (companyId: string, minScore: number) => `cache:matches:${companyId}:count:${minScore}`,

  /** Single match detail */
  matchDetail: (id: string) => `cache:match:${id}`,

  /** Company profile */
  companyProfile: (id: string) => `cache:company:${id}`,

  /** User profile */
  userProfile: (userId: string) => `cache:user:${userId}`,

  // ─── Plan & Subscription caches ────────────────────────────────────────
  /** Active plans list (shared across all users) */
  activePlans: 'cache:plans:active',

  /** Single plan detail */
  planDetail: (id: string) => `cache:plan:${id}`,

  /** Company subscription with plan JOIN */
  companySubscription: (companyId: string) => `cache:sub:${companyId}`,

  /** Admin dashboard metrics for a period */
  adminDashboard: (period: string) => `cache:admin:dashboard:${period}`,

  /** Admin client list */
  adminClients: (filterHash: string) => `cache:admin:clients:${filterHash}`,

  // ─── Invalidation patterns ──────────────────────────────────────────────
  /** All tender list caches */
  allTenderLists: 'cache:tenders:*',

  /** All match caches for a company */
  allCompanyMatches: (companyId: string) => `cache:matches:${companyId}:*`,

  /** All plan caches */
  allPlans: 'cache:plans:*',

  /** Subscription cache for a company */
  allCompanySubscription: (companyId: string) => `cache:sub:${companyId}`,

  /** All admin caches */
  allAdmin: 'cache:admin:*',

  /** All caches */
  all: 'cache:*',
} as const

export const TTL = {
  tenderList: DEFAULT_TTL,        // 5 min — new tenders arrive every 4h
  tenderDetail: TENDER_DETAIL_TTL, // 30 min — tender details rarely change
  tenderDocs: TENDER_DETAIL_TTL,   // 30 min
  stats: STATS_TTL,               // 10 min
  matchList: 120,                 // 2 min — matches change on user interaction
  matchCount: 120,                // 2 min
  matchDetail: 60,                // 1 min — AI analysis can update match
  userProfile: 300,               // 5 min
  companyProfile: 600,            // 10 min
  activePlans: 600,               // 10 min — plans rarely change
  planDetail: 600,                // 10 min
  companySubscription: 120,       // 2 min — sub changes are important
  adminDashboard: 300,            // 5 min
  adminClients: 120,              // 2 min
} as const
