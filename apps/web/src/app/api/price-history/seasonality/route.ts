import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPriceHistoryCacheAdapter, checkRedisRateLimit } from '@/lib/price-history-cache'
import crypto from 'crypto'

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const UF_LIST = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
]

interface MonthBucket {
  prices: number[]
  discounts: number[]
}

interface YearBucket {
  prices: number[]
  volume: number
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

export async function GET(req: NextRequest) {
  const startTime = Date.now()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limiting: 30 req/min per user
  const rateLimit = await checkRedisRateLimit(`season:${user.id}`, 30, 60)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Muitas requisicoes. Tente novamente em breve.', retry_after: rateLimit.retryAfter },
      { status: 429 },
    )
  }

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim()
  if (!q || q.length < 3) {
    return NextResponse.json(
      { error: 'Query must be at least 3 characters' },
      { status: 400 },
    )
  }

  const uf = url.searchParams.get('uf')?.toUpperCase() || undefined
  const modalidade = url.searchParams.get('modalidade') || undefined

  if (uf && !UF_LIST.includes(uf)) {
    return NextResponse.json({ error: 'Invalid UF' }, { status: 400 })
  }

  try {
    const cache = getPriceHistoryCacheAdapter()

    const filterHash = crypto.createHash('md5').update(
      JSON.stringify({ q: q.toLowerCase(), uf, modalidade })
    ).digest('hex').slice(0, 12)

    const cacheKey = `season:${filterHash}`

    // Try cache first (4h TTL for seasonal data)
    const cached = await cache.get<object>(cacheKey)
    if (cached) {
      return NextResponse.json({
        ...cached,
        cache_hit: true,
        query_time_ms: Date.now() - startTime,
      })
    }

    // Build query: tenders + competitors (inner join)
    let query = supabase
      .from('tenders')
      .select(
        'id, objeto, valor_estimado, uf, modalidade_nome, data_encerramento, data_publicacao, competitors!inner(valor_proposta)',
      )
      .textSearch('objeto', q, { type: 'websearch', config: 'portuguese' })
      .gt('competitors.valor_proposta', 0)
      .gt('valor_estimado', 0)

    if (uf) {
      query = query.eq('uf', uf)
    }
    if (modalidade) {
      query = query.eq('modalidade_nome', modalidade)
    }

    // Limit to 50 tenders to avoid statement timeout
    // (each tender has many competitors, so 50 tenders = hundreds of data points)
    query = query
      .order('data_encerramento', { ascending: false })
      .limit(50)

    const { data, error } = await query

    if (error) {
      console.error('Seasonality query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        monthly: [],
        quarterly: [],
        best_months: [],
        yoy: [],
        total_records: 0,
        years_analyzed: 0,
        cache_hit: false,
        query_time_ms: Date.now() - startTime,
      })
    }

    // Aggregate data into buckets
    const monthBuckets: Record<number, MonthBucket> = {}
    const yearBuckets: Record<number, YearBucket> = {}
    const allPrices: number[] = []
    const yearsSet = new Set<number>()
    let totalRecords = 0

    for (let m = 1; m <= 12; m++) {
      monthBuckets[m] = { prices: [], discounts: [] }
    }

    for (const tender of data) {
      const dateStr = tender.data_encerramento || tender.data_publicacao
      if (!dateStr) continue

      const date = new Date(dateStr)
      if (isNaN(date.getTime())) continue
      const month = date.getMonth() + 1 // 1-12
      const year = date.getFullYear()
      if (month < 1 || month > 12 || year < 2000 || year > 2100) continue
      const valorEstimado = tender.valor_estimado as number

      yearsSet.add(year)

      if (!yearBuckets[year]) {
        yearBuckets[year] = { prices: [], volume: 0 }
      }

      const competitors = (tender.competitors || []) as Array<{ valor_proposta: number | null }>

      for (const comp of competitors) {
        if (!comp.valor_proposta || comp.valor_proposta <= 0) continue

        const price = comp.valor_proposta
        const discountPct = valorEstimado > 0
          ? ((valorEstimado - price) / valorEstimado) * 100
          : 0

        monthBuckets[month].prices.push(price)
        monthBuckets[month].discounts.push(discountPct)

        yearBuckets[year].prices.push(price)
        yearBuckets[year].volume++

        allPrices.push(price)
        totalRecords++
      }
    }

    const globalMedian = median(allPrices)

    // Monthly aggregation
    const monthly = []
    for (let m = 1; m <= 12; m++) {
      const bucket = monthBuckets[m]
      const volume = bucket.prices.length
      const avgPrice = volume > 0
        ? bucket.prices.reduce((a, b) => a + b, 0) / volume
        : 0
      const medianPrice = median(bucket.prices)
      const avgDiscount = volume > 0
        ? bucket.discounts.reduce((a, b) => a + b, 0) / volume
        : 0
      const priceIndex = globalMedian > 0
        ? (medianPrice / globalMedian) * 100
        : 0

      monthly.push({
        month: m,
        month_name: MONTH_NAMES[m - 1],
        avg_price: Math.round(avgPrice * 100) / 100,
        median_price: Math.round(medianPrice * 100) / 100,
        avg_discount: Math.round(avgDiscount * 100) / 100,
        volume,
        price_index: Math.round(priceIndex * 100) / 100,
      })
    }

    // Quarterly aggregation
    const quarterMap: Record<string, { prices: number[]; discounts: number[] }> = {
      Q1: { prices: [], discounts: [] },
      Q2: { prices: [], discounts: [] },
      Q3: { prices: [], discounts: [] },
      Q4: { prices: [], discounts: [] },
    }

    for (let m = 1; m <= 12; m++) {
      const qKey = m <= 3 ? 'Q1' : m <= 6 ? 'Q2' : m <= 9 ? 'Q3' : 'Q4'
      quarterMap[qKey].prices.push(...monthBuckets[m].prices)
      quarterMap[qKey].discounts.push(...monthBuckets[m].discounts)
    }

    const quarterly = (['Q1', 'Q2', 'Q3', 'Q4'] as const).map((quarter) => {
      const qb = quarterMap[quarter]
      const volume = qb.prices.length
      const avgPrice = volume > 0
        ? qb.prices.reduce((a, b) => a + b, 0) / volume
        : 0
      const medianPrice = median(qb.prices)
      const avgDiscount = volume > 0
        ? qb.discounts.reduce((a, b) => a + b, 0) / volume
        : 0
      const priceIndex = globalMedian > 0
        ? (medianPrice / globalMedian) * 100
        : 0

      return {
        quarter,
        avg_price: Math.round(avgPrice * 100) / 100,
        median_price: Math.round(medianPrice * 100) / 100,
        avg_discount: Math.round(avgDiscount * 100) / 100,
        volume,
        price_index: Math.round(priceIndex * 100) / 100,
      }
    })

    // Best months: sorted by median_price ascending, with savings_vs_avg_pct
    const best_months = monthly
      .filter((m) => m.volume > 0)
      .sort((a, b) => a.median_price - b.median_price)
      .map((m) => ({
        month: m.month,
        month_name: m.month_name,
        median_price: m.median_price,
        savings_vs_avg_pct: globalMedian > 0
          ? Math.round(((globalMedian - m.median_price) / globalMedian) * 100 * 100) / 100
          : 0,
      }))

    // Year-over-year comparison
    const sortedYears = [...yearsSet].sort((a, b) => a - b)
    const yoy = sortedYears.map((year, idx) => {
      const yb = yearBuckets[year]
      const avgPrice = yb.volume > 0
        ? yb.prices.reduce((a, b) => a + b, 0) / yb.volume
        : 0
      let variationPct: number | null = null

      if (idx > 0) {
        const prevYear = sortedYears[idx - 1]
        const prevBucket = yearBuckets[prevYear]
        const prevAvg = prevBucket.volume > 0
          ? prevBucket.prices.reduce((a, b) => a + b, 0) / prevBucket.volume
          : 0
        if (prevAvg > 0) {
          variationPct = Math.round(((avgPrice - prevAvg) / prevAvg) * 100 * 100) / 100
        }
      }

      return {
        year,
        avg_price: Math.round(avgPrice * 100) / 100,
        volume: yb.volume,
        variation_pct: variationPct,
      }
    })

    const result = {
      monthly,
      quarterly,
      best_months,
      yoy,
      total_records: totalRecords,
      years_analyzed: yearsSet.size,
    }

    // Cache for 4 hours (seasonal data is slow-changing)
    cache.set(cacheKey, result, 14400).catch(() => {})

    return NextResponse.json({
      ...result,
      cache_hit: false,
      query_time_ms: Date.now() - startTime,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error'
    console.error('Seasonality analysis error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
