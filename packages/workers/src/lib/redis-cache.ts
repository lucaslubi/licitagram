import IORedis from 'ioredis'
import { logger } from './logger'

/**
 * Redis cache for workers.
 * Used for:
 * - Deduplication cache (avoid DB lookups for already-seen pncp_ids)
 * - Cache invalidation after scraping/processing
 * - Stats tracking
 */

let cacheRedis: IORedis | null = null

function getCache(): IORedis {
  if (!cacheRedis) {
    cacheRedis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })
    cacheRedis.on('error', (err) => {
      logger.error({ err: err.message }, 'Redis cache connection error')
    })
  }
  return cacheRedis
}

// ─── Deduplication Cache ─────────────────────────────────────────────────────

const DEDUP_TTL = 7 * 24 * 60 * 60 // 7 days
const DEDUP_PREFIX = 'dedup:pncp:'

/**
 * Check if a pncp_id has been seen recently.
 * Returns true if already exists (skip), false if new (process).
 */
export async function isDuplicate(pncpId: string): Promise<boolean> {
  try {
    const result = await getCache().exists(`${DEDUP_PREFIX}${pncpId}`)
    return result === 1
  } catch {
    return false // Redis down — fall through to DB check
  }
}

/**
 * Mark a pncp_id as seen.
 */
export async function markSeen(pncpId: string): Promise<void> {
  try {
    await getCache().set(`${DEDUP_PREFIX}${pncpId}`, '1', 'EX', DEDUP_TTL)
  } catch {
    // Ignore
  }
}

/**
 * Mark multiple pncp_ids as seen in a batch.
 */
export async function markSeenBatch(pncpIds: string[]): Promise<void> {
  if (pncpIds.length === 0) return
  try {
    const pipeline = getCache().pipeline()
    for (const id of pncpIds) {
      pipeline.set(`${DEDUP_PREFIX}${id}`, '1', 'EX', DEDUP_TTL)
    }
    await pipeline.exec()
  } catch {
    // Ignore
  }
}

// ─── Web App Cache Invalidation ──────────────────────────────────────────────

/**
 * Invalidate web app cache after workers write new data.
 * This busts the Redis cache keys used by the Next.js app.
 */
export async function invalidateTenderCaches(): Promise<void> {
  try {
    const r = getCache()
    const keys = await r.keys('cache:tenders:*')
    const statKeys = await r.keys('cache:stats:*')
    const allKeys = [...keys, ...statKeys]
    if (allKeys.length > 0) {
      await r.del(...allKeys)
      logger.info({ count: allKeys.length }, 'Invalidated tender caches')
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to invalidate tender caches')
  }
}

/**
 * Invalidate match caches for a specific company.
 * Called after keyword-matcher creates/updates matches.
 */
export async function invalidateMatchCaches(companyId: string): Promise<void> {
  try {
    const r = getCache()
    const keys = await r.keys(`cache:matches:${companyId}:*`)
    if (keys.length > 0) {
      await r.del(...keys)
      logger.debug({ companyId, count: keys.length }, 'Invalidated match caches')
    }
  } catch {
    // Ignore
  }
}

/**
 * Invalidate a single tender detail cache.
 */
export async function invalidateTenderDetail(tenderId: string): Promise<void> {
  try {
    const r = getCache()
    await r.del(`cache:tender:${tenderId}`, `cache:tender:${tenderId}:docs`)
  } catch {
    // Ignore
  }
}

// ─── Stats Tracking ──────────────────────────────────────────────────────────

/**
 * Increment a counter (e.g., tenders scraped today).
 */
export async function incrementStat(key: string, amount: number = 1): Promise<void> {
  try {
    const r = getCache()
    const redisKey = `stats:workers:${key}`
    await r.incrby(redisKey, amount)
    // Auto-expire stats after 48h
    await r.expire(redisKey, 48 * 60 * 60)
  } catch {
    // Ignore
  }
}

/**
 * Get a stat counter value.
 */
export async function getStat(key: string): Promise<number> {
  try {
    const val = await getCache().get(`stats:workers:${key}`)
    return val ? parseInt(val, 10) : 0
  } catch {
    return 0
  }
}
