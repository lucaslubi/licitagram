import IORedis from 'ioredis'

/**
 * Shared Redis client for the web app.
 * Used for:
 * - Cache layer (tender queries, stats)
 * - Cache invalidation via pub/sub from workers
 *
 * Reuses the same Redis instance as BullMQ workers.
 */

let redis: IORedis | null = null

export function getRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      // Reconnect with exponential backoff
      retryStrategy(times) {
        if (times > 10) return null // Give up after 10 retries
        return Math.min(times * 200, 5000)
      },
    })

    redis.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message)
    })
  }

  return redis
}

// ─── Cache Helpers ───────────────────────────────────────────────────────────

const DEFAULT_TTL = 300 // 5 minutes
const TENDER_DETAIL_TTL = 1800 // 30 minutes
const STATS_TTL = 600 // 10 minutes

/**
 * Get a cached value, or compute and cache it.
 * Thread-safe: uses Redis SET NX pattern to avoid thundering herd.
 */
export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number = DEFAULT_TTL,
): Promise<T> {
  const r = getRedis()

  try {
    const raw = await r.get(key)
    if (raw !== null) {
      return JSON.parse(raw) as T
    }
  } catch {
    // Redis down — fall through to direct query
  }

  const result = await fn()

  try {
    await r.set(key, JSON.stringify(result), 'EX', ttl)
  } catch {
    // Redis down — ignore, still return fresh data
  }

  return result
}

/**
 * Invalidate cache keys by pattern.
 * Workers call this after writing new data.
 */
export async function invalidateCache(pattern: string): Promise<number> {
  const r = getRedis()
  try {
    const keys = await r.keys(pattern)
    if (keys.length > 0) {
      return await r.del(...keys)
    }
    return 0
  } catch {
    return 0
  }
}

/**
 * Invalidate a specific cache key.
 */
export async function invalidateKey(key: string): Promise<void> {
  const r = getRedis()
  try {
    await r.del(key)
  } catch {
    // Ignore
  }
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
