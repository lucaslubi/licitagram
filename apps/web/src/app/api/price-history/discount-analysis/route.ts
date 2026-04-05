import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPriceHistoryCacheAdapter, checkRedisRateLimit } from '@/lib/price-history-cache'
import crypto from 'crypto'

const UF_LIST = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
]

interface DiscountEntry {
  discount_pct: number
  uf: string
  porte: string
  modalidade: string
  month: string
  is_winner: boolean
}

interface DiscountAnalysisResult {
  global: {
    mean_discount: number
    median_discount: number
    min_discount: number
    max_discount: number
    std_deviation: number
    total_records: number
  }
  histogram: { range: string; count: number; percentage: number }[]
  by_uf: { uf: string; count: number; mean_discount: number; median_discount: number }[]
  by_porte: { porte: string; count: number; mean_discount: number; median_discount: number }[]
  by_modalidade: { modalidade: string; count: number; mean_discount: number; median_discount: number }[]
  trend: { month: string; mean_discount: number; median_discount: number; count: number }[]
  winner_vs_loser: {
    winners: { mean_discount: number; median_discount: number; count: number }
    losers: { mean_discount: number; median_discount: number; count: number }
  }
}

const WINNER_SITUACOES = ['Informado', 'Homologado']

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function stdDeviation(arr: number[]): number {
  if (arr.length < 2) return 0
  const avg = mean(arr)
  const squareDiffs = arr.map((v) => (v - avg) ** 2)
  return Math.sqrt(squareDiffs.reduce((s, v) => s + v, 0) / (arr.length - 1))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function buildHistogram(discounts: number[]): { range: string; count: number; percentage: number }[] {
  // Buckets: [-Inf,-50], [-50,-40], [-40,-30], [-30,-20], [-20,-10], [-10,0],
  //          [0,10], [10,20], [20,30], [30,40], [40,50], [50,Inf]
  const bucketDefs: { label: string; min: number; max: number }[] = [
    { label: '< -50%', min: -Infinity, max: -50 },
    { label: '-50% a -40%', min: -50, max: -40 },
    { label: '-40% a -30%', min: -40, max: -30 },
    { label: '-30% a -20%', min: -30, max: -20 },
    { label: '-20% a -10%', min: -20, max: -10 },
    { label: '-10% a 0%', min: -10, max: 0 },
    { label: '0% a 10%', min: 0, max: 10 },
    { label: '10% a 20%', min: 10, max: 20 },
    { label: '20% a 30%', min: 20, max: 30 },
    { label: '30% a 40%', min: 30, max: 40 },
    { label: '40% a 50%', min: 40, max: 50 },
    { label: '> 50%', min: 50, max: Infinity },
  ]

  const total = discounts.length
  if (total === 0) return []

  const counts = new Array(bucketDefs.length).fill(0) as number[]

  for (const d of discounts) {
    for (let i = 0; i < bucketDefs.length; i++) {
      const b = bucketDefs[i]
      if (d >= b.min && d < b.max) {
        counts[i]++
        break
      }
      // Last bucket includes upper bound (Infinity)
      if (i === bucketDefs.length - 1) {
        counts[i]++
      }
    }
  }

  return bucketDefs
    .map((b, i) => ({
      range: b.label,
      count: counts[i],
      percentage: round2((counts[i] / total) * 100),
    }))
    .filter((b) => b.count > 0)
}

function groupStats(
  entries: DiscountEntry[],
  keyFn: (e: DiscountEntry) => string,
): { key: string; count: number; mean_discount: number; median_discount: number }[] {
  const groups = new Map<string, number[]>()

  for (const e of entries) {
    const k = keyFn(e)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(e.discount_pct)
  }

  return Array.from(groups.entries())
    .map(([key, vals]) => ({
      key,
      count: vals.length,
      mean_discount: round2(mean(vals)),
      median_discount: round2(median(vals)),
    }))
    .sort((a, b) => b.count - a.count)
}

export async function GET(req: NextRequest) {
  const startTime = Date.now()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limiting: 20 req/min per user
  const rateLimit = await checkRedisRateLimit(`discount:${user.id}`, 20, 60)
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
  const dateFrom = url.searchParams.get('date_from') || undefined
  const dateTo = url.searchParams.get('date_to') || undefined

  // Validate UF if provided
  if (uf && !UF_LIST.includes(uf)) {
    return NextResponse.json({ error: 'Invalid UF' }, { status: 400 })
  }

  try {
    const cache = getPriceHistoryCacheAdapter()

    const filterHash = crypto.createHash('md5').update(
      JSON.stringify({ q: q.toLowerCase(), uf, modalidade, dateFrom, dateTo })
    ).digest('hex').slice(0, 12)

    const cacheKey = `discount:${filterHash}`

    // Try cache first
    const cached = await cache.get<DiscountAnalysisResult>(cacheKey)
    if (cached) {
      return NextResponse.json({
        ...cached,
        cache_hit: true,
        query_time_ms: Date.now() - startTime,
      })
    }

    // Use RPC for efficient server-side query (CTE + GIN index)
    const { data: rpcData, error } = await supabase.rpc('search_tenders_with_bids', {
      p_query: q,
      p_uf: uf || null,
      p_modalidade: modalidade || null,
      p_date_from: dateFrom || null,
      p_date_to: dateTo || null,
      p_limit: 50,
    })

    if (error) {
      console.error('Discount analysis query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Build discount entries from RPC flat rows
    const entries: DiscountEntry[] = []

    if (rpcData) {
      for (const row of rpcData as Array<Record<string, unknown>>) {
        const valorEstimado = row.valor_estimado as number
        const valorProposta = row.valor_proposta as number
        if (!valorEstimado || !valorProposta) continue

        const discountPct = ((valorEstimado - valorProposta) / valorEstimado) * 100
        const isWinner = WINNER_SITUACOES.includes((row.situacao as string) || '')
        const tenderMonth = row.data_encerramento
          ? String(row.data_encerramento).slice(0, 7)
          : 'unknown'

        entries.push({
          discount_pct: round2(discountPct),
          uf: (row.uf as string) || 'N/I',
          porte: normalizePorte(row.porte as string),
          modalidade: (row.modalidade_nome as string) || 'N/I',
          month: tenderMonth,
          is_winner: isWinner,
        })
      }
    }

    if (entries.length === 0) {
      return NextResponse.json({
        global: { mean_discount: 0, median_discount: 0, min_discount: 0, max_discount: 0, std_deviation: 0, total_records: 0 },
        histogram: [],
        by_uf: [],
        by_porte: [],
        by_modalidade: [],
        trend: [],
        winner_vs_loser: {
          winners: { mean_discount: 0, median_discount: 0, count: 0 },
          losers: { mean_discount: 0, median_discount: 0, count: 0 },
        },
        cache_hit: false,
        query_time_ms: Date.now() - startTime,
      })
    }

    const allDiscounts = entries.map((e) => e.discount_pct)

    // Global stats
    const global = {
      mean_discount: round2(mean(allDiscounts)),
      median_discount: round2(median(allDiscounts)),
      min_discount: round2(Math.min(...allDiscounts)),
      max_discount: round2(Math.max(...allDiscounts)),
      std_deviation: round2(stdDeviation(allDiscounts)),
      total_records: entries.length,
    }

    // Histogram
    const histogram = buildHistogram(allDiscounts)

    // By UF (top 10)
    const byUfAll = groupStats(entries, (e) => e.uf)
    const by_uf = byUfAll.slice(0, 10).map(({ key, ...rest }) => ({ uf: key, ...rest }))

    // By porte
    const by_porte = groupStats(entries, (e) => e.porte).map(({ key, ...rest }) => ({ porte: key, ...rest }))

    // By modalidade
    const by_modalidade = groupStats(entries, (e) => e.modalidade).map(({ key, ...rest }) => ({ modalidade: key, ...rest }))

    // Monthly trend
    const trendGroups = groupStats(
      entries.filter((e) => e.month !== 'unknown'),
      (e) => e.month,
    )
    const trend = trendGroups
      .map(({ key, ...rest }) => ({ month: key, ...rest }))
      .sort((a, b) => a.month.localeCompare(b.month))

    // Winner vs loser
    const winners = entries.filter((e) => e.is_winner)
    const losers = entries.filter((e) => !e.is_winner)

    const winnerDiscounts = winners.map((e) => e.discount_pct)
    const loserDiscounts = losers.map((e) => e.discount_pct)

    const winner_vs_loser = {
      winners: {
        mean_discount: round2(mean(winnerDiscounts)),
        median_discount: round2(median(winnerDiscounts)),
        count: winners.length,
      },
      losers: {
        mean_discount: round2(mean(loserDiscounts)),
        median_discount: round2(median(loserDiscounts)),
        count: losers.length,
      },
    }

    const result: DiscountAnalysisResult = {
      global,
      histogram,
      by_uf,
      by_porte,
      by_modalidade,
      trend,
      winner_vs_loser,
    }

    // Cache for 2 hours
    cache.set(cacheKey, result, 7200).catch(() => {})

    return NextResponse.json({
      ...result,
      cache_hit: false,
      query_time_ms: Date.now() - startTime,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error'
    console.error('Discount analysis error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function normalizePorte(porte: string | null | undefined): string {
  if (!porte) return 'N/A'
  const upper = porte.toUpperCase()
  if (upper.includes('ME') && !upper.includes('MEDIO')) return 'ME'
  if (upper.includes('EPP')) return 'EPP'
  if (upper.includes('MEDIO') || upper.includes('MÉDIA')) return 'MEDIO'
  if (upper.includes('GRANDE')) return 'GRANDE'
  return 'N/A'
}
