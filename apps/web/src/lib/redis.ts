/**
 * Cache layer backed by Redis (ioredis) with in-memory fallback.
 *
 * Uses the ioredis client from redis-client.ts as the primary shared cache.
 * Falls back to an in-memory Map when Redis is unavailable (no REDIS_URL,
 * connection error, etc.) so the app never breaks due to cache issues.
 *
 * Benefits:
 * - Shared cache across all Vercel function instances
 * - Automatic fallback to per-instance Map if Redis is down
 * - Same exported API — callers don't need changes
 */

import { getRedisClient } from './redis-client'

// ─── In-memory fallback ─────────────────────────────────────────────────────

interface CacheEntry<T = unknown> {
  value: T
  expiresAt: number
}

const memCache = new Map<string, CacheEntry>()

const CLEANUP_INTERVAL = 60_000
let cleanupTimer: ReturnType<typeof setInterval> | null = null

function ensureCleanup() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of memCache) {
      if (entry.expiresAt <= now) {
        memCache.delete(key)
      }
    }
    if (memCache.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer)
      cleanupTimer = null
    }
  }, CLEANUP_INTERVAL)
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref()
  }
}

// ─── Redis helpers ──────────────────────────────────────────────────────────

function getRedis() {
  try {
    return getRedisClient()
  } catch {
    return null
  }
}

// ─── Public API (same interface as before) ──────────────────────────────────

const DEFAULT_TTL = 300 // 5 minutes
const TENDER_DETAIL_TTL = 1800 // 30 minutes
const STATS_TTL = 600 // 10 minutes

/**
 * Get a cached value, or compute and cache it.
 * Tries Redis first, falls back to in-memory Map.
 */
export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number = DEFAULT_TTL,
): Promise<T> {
  const redis = getRedis()

  // --- Try Redis GET ---
  if (redis) {
    try {
      const raw = await redis.get(key)
      if (raw !== null) {
        return JSON.parse(raw) as T
      }
    } catch (err) {
      console.warn('[cache] Redis GET failed, falling back to memory:', (err as Error).message)
    }
  }

  // --- Try in-memory GET ---
  const now = Date.now()
  const memEntry = memCache.get(key)
  if (memEntry && memEntry.expiresAt > now) {
    return memEntry.value as T
  }

  // --- Cache miss: compute value ---
  const result = await fn()

  // --- Write to Redis ---
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(result), 'EX', ttl)
    } catch (err) {
      console.warn('[cache] Redis SET failed, using memory only:', (err as Error).message)
    }
  }

  // --- Always write to in-memory as backup ---
  memCache.set(key, { value: result, expiresAt: Date.now() + ttl * 1000 })
  ensureCleanup()

  return result
}

/**
 * Invalidate cache keys by pattern (supports * glob at the end).
 */
export async function invalidateCache(pattern: string): Promise<number> {
  const redis = getRedis()
  let redisCount = 0

  // --- Invalidate in Redis ---
  if (redis) {
    try {
      if (!pattern.includes('*')) {
        redisCount = await redis.del(pattern)
      } else {
        // SCAN-based pattern deletion (safe for production, no KEYS command)
        let cursor = '0'
        const keysToDelete: string[] = []
        do {
          const [nextCursor, keys] = await redis.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            100,
          )
          cursor = nextCursor
          keysToDelete.push(...keys)
        } while (cursor !== '0')

        if (keysToDelete.length > 0) {
          redisCount = await redis.del(...keysToDelete)
        }
      }
    } catch (err) {
      console.warn('[cache] Redis invalidateCache failed:', (err as Error).message)
    }
  }

  // --- Invalidate in memory ---
  let memCount = 0
  if (!pattern.includes('*')) {
    memCount = memCache.has(pattern) ? 1 : 0
    memCache.delete(pattern)
  } else {
    const prefix = pattern.replace(/\*+$/, '')
    for (const key of memCache.keys()) {
      if (key.startsWith(prefix)) {
        memCache.delete(key)
        memCount++
      }
    }
  }

  return Math.max(redisCount, memCount)
}

/**
 * Invalidate a specific cache key.
 */
export async function invalidateKey(key: string): Promise<void> {
  const redis = getRedis()
  if (redis) {
    try {
      await redis.del(key)
    } catch (err) {
      console.warn('[cache] Redis invalidateKey failed:', (err as Error).message)
    }
  }
  memCache.delete(key)
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
