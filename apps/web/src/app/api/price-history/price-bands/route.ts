import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan } from '@/lib/auth-helpers'
import { getPriceHistoryCacheAdapter, checkRedisRateLimit } from '@/lib/price-history-cache'
import crypto from 'crypto'

/**
 * GET /api/price-history/price-bands?q=software&uf=SP&modalidade=Pregão
 *
 * Returns price band segmentation for a search query.
 * Shows how many tenders exist in each valor_estimado range.
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now()

  const supabase = await createClient()
  const user = await getUserWithPlan()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rateLimit = await checkRedisRateLimit(`price-bands:${user.userId}`, 30, 60)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Muitas requisições. Tente novamente em breve.', retry_after: rateLimit.retryAfter },
      { status: 429 },
    )
  }

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim()
  if (!q || q.length < 3) {
    return NextResponse.json({ error: 'Query deve ter pelo menos 3 caracteres' }, { status: 400 })
  }

  const uf = url.searchParams.get('uf')?.toUpperCase() || null
  const modalidade = url.searchParams.get('modalidade') || null

  try {
    const cache = getPriceHistoryCacheAdapter()
    const filterHash = crypto
      .createHash('md5')
      .update(JSON.stringify({ q: q.toLowerCase(), uf, modalidade }))
      .digest('hex')
      .slice(0, 12)
    const cacheKey = `price-bands:${filterHash}`

    const cached = await cache.get<object>(cacheKey)
    if (cached) {
      return NextResponse.json({ ...cached, cache_hit: true, query_time_ms: Date.now() - startTime })
    }

    const { data: bands, error } = await supabase.rpc('get_price_bands', {
      p_query: q,
      p_uf: uf,
      p_modalidade: modalidade,
    })

    if (error) {
      console.error('Price bands RPC error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const result = {
      bands: (bands || []).map((b: any) => ({
        band_id: b.band_id,
        band_label: b.band_label,
        range: { min: Number(b.band_min), max: Number(b.band_max) },
        count: Number(b.total_bids),
        winner_count: Number(b.total_wins),
        avg_discount_ratio: Number(b.avg_discount_ratio),
        median_discount_ratio: Number(b.median_discount_ratio),
        winner_avg_discount_ratio: Number(b.winner_avg_discount_ratio),
        avg_valor_estimado: Number(b.avg_valor_estimado),
        // Derived: avg discount %
        avg_discount_pct: Math.round((1 - Number(b.avg_discount_ratio)) * 1000) / 10,
      })),
      query_time_ms: Date.now() - startTime,
    }

    // Cache for 2 hours
    cache.set(cacheKey, result, 7200).catch(() => {})

    return NextResponse.json({ ...result, cache_hit: false })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro interno'
    console.error('Price bands error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
