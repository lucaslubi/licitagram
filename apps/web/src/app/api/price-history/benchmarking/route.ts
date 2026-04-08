import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculatePercentile } from '@licitagram/price-history'
import { getPriceHistoryCacheAdapter, checkRedisRateLimit } from '@/lib/price-history-cache'
import { fetchTendersWithBids } from '@/lib/price-history-query'
import crypto from 'crypto'

const UF_LIST = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
]

type Rating = 'muito_competitivo' | 'competitivo' | 'na_media' | 'acima_da_media' | 'nao_competitivo'

interface SimilarWin {
  valor: number
  orgao: string
  uf: string
  data: string
  fornecedor: string
  discount_pct: number
}

interface BenchmarkResult {
  target_price: number
  percentile: number
  below_count: number
  above_count: number
  total_count: number
  market: {
    mean: number
    median: number
    min: number
    max: number
    p10: number
    p25: number
    p75: number
    p90: number
    std_deviation: number
  }
  rating: Rating
  ranges: {
    agressivo: { min: number; max: number }
    competitivo: { min: number; max: number }
    moderado: { min: number; max: number }
    conservador: { min: number; max: number }
  }
  similar_wins: SimilarWin[]
}

function getRating(percentile: number): Rating {
  if (percentile <= 15) return 'muito_competitivo'
  if (percentile <= 35) return 'competitivo'
  if (percentile <= 65) return 'na_media'
  if (percentile <= 85) return 'acima_da_media'
  return 'nao_competitivo'
}

function computeStdDeviation(values: number[], mean: number): number {
  if (values.length < 2) return 0
  const sumSqDiff = values.reduce((acc, v) => acc + (v - mean) ** 2, 0)
  return Math.sqrt(sumSqDiff / (values.length - 1))
}

function computePercentilePosition(sorted: number[], target: number): number {
  if (sorted.length === 0) return 0
  const belowCount = sorted.filter((v) => v < target).length
  const equalCount = sorted.filter((v) => v === target).length
  // Use mid-rank percentile: (below + 0.5 * equal) / total * 100
  return ((belowCount + 0.5 * equalCount) / sorted.length) * 100
}

export async function GET(req: NextRequest) {
  const startTime = Date.now()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limiting: 20 req/min per user
  const rateLimit = await checkRedisRateLimit(`bench:${user.id}`, 20, 60)
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

  const targetPriceStr = url.searchParams.get('target_price')
  if (!targetPriceStr) {
    return NextResponse.json(
      { error: 'target_price is required' },
      { status: 400 },
    )
  }
  const targetPrice = parseFloat(targetPriceStr)
  if (isNaN(targetPrice) || targetPrice <= 0) {
    return NextResponse.json(
      { error: 'target_price must be a positive number' },
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
      JSON.stringify({ q: q.toLowerCase(), target_price: targetPrice, uf, modalidade, dateFrom, dateTo })
    ).digest('hex').slice(0, 12)

    const cacheKey = `bench:${filterHash}`

    // Try cache first
    const cached = await cache.get<BenchmarkResult & { cache_hit: boolean; query_time_ms: number }>(cacheKey)
    if (cached) {
      return NextResponse.json({
        ...cached,
        cache_hit: true,
        query_time_ms: Date.now() - startTime,
      })
    }



    // Use JS logic instead of Postgres RPC to bypass return type mismatch
    let rpcData: any;
    let error: any = null;
    try {
      rpcData = await fetchTendersWithBids(supabase, {
        p_query: q,
        p_uf: uf || null,
        p_modalidade: modalidade || null,
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
        p_limit: 20,
      })
    } catch (e) {
      error = e;
    }

    if (error) {
      console.error('Benchmarking query error:', error)
      return NextResponse.json({ error: error.message || String(error) }, { status: 500 })
    }

    const data = rpcData as Array<Record<string, unknown>> | null

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum resultado encontrado para esta pesquisa' },
        { status: 404 },
      )
    }

    // Extract all valor_proposta values from RPC flat rows
    const allPrices: number[] = []
    const winningBids: {
      valor: number
      orgao: string
      uf: string
      data: string
      fornecedor: string
      valor_estimado: number | null
    }[] = []

    for (const row of data) {
      const valorProposta = row.valor_proposta as number
      if (!valorProposta || valorProposta <= 0) continue

      allPrices.push(valorProposta)

      // Collect winning bids for similar_wins
      const situacao = ((row.situacao as string) || '').trim()
      if (situacao === 'Informado' || situacao === 'Homologado') {
        winningBids.push({
          valor: valorProposta,
          orgao: (row.orgao_nome as string) || 'N/I',
          uf: (row.uf as string) || '',
          data: ((row.data_encerramento || row.data_publicacao) as string) || '',
          fornecedor: (row.nome as string) || 'N/I',
          valor_estimado: row.valor_estimado as number | null,
        })
      }
    }

    if (allPrices.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma proposta valida encontrada para esta pesquisa' },
        { status: 404 },
      )
    }

    // Sort prices for percentile calculations
    const sorted = [...allPrices].sort((a, b) => a - b)
    const total = sorted.length

    // Market statistics
    const sum = sorted.reduce((a, b) => a + b, 0)
    const mean = sum / total
    const median = calculatePercentile(sorted, 50)
    const p10 = calculatePercentile(sorted, 10)
    const p25 = calculatePercentile(sorted, 25)
    const p75 = calculatePercentile(sorted, 75)
    const p90 = calculatePercentile(sorted, 90)
    const stdDeviation = computeStdDeviation(sorted, mean)

    // Percentile position of target price
    const percentile = Math.round(computePercentilePosition(sorted, targetPrice) * 100) / 100

    // Counts
    const belowCount = sorted.filter((v) => v < targetPrice).length
    const aboveCount = sorted.filter((v) => v > targetPrice).length

    // Rating
    const rating = getRating(percentile)

    // Recommended price ranges
    const ranges = {
      agressivo: { min: Math.round(p10 * 100) / 100, max: Math.round(p25 * 100) / 100 },
      competitivo: { min: Math.round(p25 * 100) / 100, max: Math.round(median * 100) / 100 },
      moderado: { min: Math.round(median * 100) / 100, max: Math.round(p75 * 100) / 100 },
      conservador: { min: Math.round(p75 * 100) / 100, max: Math.round(p90 * 100) / 100 },
    }

    // Similar winning bids — closest 5 to target price
    const similarWins: SimilarWin[] = winningBids
      .sort((a, b) => Math.abs(a.valor - targetPrice) - Math.abs(b.valor - targetPrice))
      .slice(0, 5)
      .map((w) => ({
        valor: w.valor,
        orgao: w.orgao,
        uf: w.uf,
        data: w.data,
        fornecedor: w.fornecedor,
        discount_pct: w.valor_estimado && w.valor_estimado > 0
          ? Math.round(((w.valor_estimado - w.valor) / w.valor_estimado) * 10000) / 100
          : 0,
      }))

    const result: BenchmarkResult = {
      target_price: targetPrice,
      percentile,
      below_count: belowCount,
      above_count: aboveCount,
      total_count: total,
      market: {
        mean: Math.round(mean * 100) / 100,
        median: Math.round(median * 100) / 100,
        min: sorted[0],
        max: sorted[total - 1],
        p10: Math.round(p10 * 100) / 100,
        p25: Math.round(p25 * 100) / 100,
        p75: Math.round(p75 * 100) / 100,
        p90: Math.round(p90 * 100) / 100,
        std_deviation: Math.round(stdDeviation * 100) / 100,
      },
      rating,
      ranges,
      similar_wins: similarWins,
    }

    // Cache for 1 hour
    cache.set(cacheKey, result, 3600).catch(() => {})

    return NextResponse.json({
      ...result,
      cache_hit: false,
      query_time_ms: Date.now() - startTime,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error'
    console.error('Benchmarking error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
