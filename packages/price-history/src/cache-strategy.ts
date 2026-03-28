import type { CacheAdapter, PriceRecord } from './types'

/**
 * Execute a query with cache-aside strategy.
 * Returns the data and whether it was a cache hit.
 */
export async function cachedQuery<T>(
  cache: CacheAdapter,
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
): Promise<{ data: T; cache_hit: boolean }> {
  const cached = await cache.get<T>(key)
  if (cached !== null) {
    return { data: cached, cache_hit: true }
  }

  const data = await fetcher()
  await cache.set(key, data, ttl)
  return { data, cache_hit: false }
}

/**
 * Determine if a cache entry should be invalidated based on a new record.
 * Returns true if the new record's description or category overlaps with the cache key.
 */
export function shouldInvalidate(
  newRecord: Partial<PriceRecord>,
  cacheKey: string,
): boolean {
  // If the cache key contains a hash, we can't easily determine overlap.
  // Invalidate conservatively: any new record invalidates keys matching its description keywords.
  if (!newRecord.item_description) return false

  const keywords = newRecord.item_description
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)

  // Simple heuristic: if any significant keyword appears in the cache key, invalidate
  return keywords.some((kw) => cacheKey.toLowerCase().includes(kw))
}
