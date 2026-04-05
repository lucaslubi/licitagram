import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPriceHistoryCacheAdapter, checkRedisRateLimit } from '@/lib/price-history-cache'
import crypto from 'crypto'

const WINNER_SITUACOES = ['Informado', 'Homologado']

interface CompetitorProfileResult {
  cnpj: string
  nome: string
  porte: string
  uf: string
  stats: {
    total_bids: number
    total_wins: number
    win_rate: number
    avg_bid: number
    median_bid: number
    avg_discount: number
    median_discount: number
    min_bid: number
    max_bid: number
  }
  behavior: {
    aggressiveness: 'muito_agressivo' | 'agressivo' | 'moderado' | 'conservador'
    typical_discount_range: { min: number; max: number }
    consistency: 'alta' | 'media' | 'baixa'
    preferred_modalidades: string[]
    active_ufs: string[]
  }
  recent_bids: {
    tender_id: string
    objeto: string
    orgao: string
    uf: string
    data: string
    valor_proposta: number
    valor_estimado: number
    discount_pct: number
    situacao: string
    won: boolean
  }[]
  monthly_activity: {
    month: string
    bids: number
    wins: number
    avg_bid: number
  }[]
  first_seen: string | null
  last_seen: string | null
}

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

function classifyAggressiveness(
  medianDiscount: number,
): 'muito_agressivo' | 'agressivo' | 'moderado' | 'conservador' {
  if (medianDiscount > 30) return 'muito_agressivo'
  if (medianDiscount > 15) return 'agressivo'
  if (medianDiscount > 5) return 'moderado'
  return 'conservador'
}

function classifyConsistency(cv: number): 'alta' | 'media' | 'baixa' {
  if (cv < 20) return 'alta'
  if (cv < 40) return 'media'
  return 'baixa'
}

export async function GET(req: NextRequest) {
  const startTime = Date.now()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limiting: 20 req/min per user
  const rateLimit = await checkRedisRateLimit(`comp-profile:${user.id}`, 20, 60)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Muitas requisicoes. Tente novamente em breve.', retry_after: rateLimit.retryAfter },
      { status: 429 },
    )
  }

  const url = new URL(req.url)
  const cnpj = url.searchParams.get('cnpj')?.trim()
  const q = url.searchParams.get('q')?.trim() || undefined

  if (!cnpj) {
    return NextResponse.json(
      { error: 'CNPJ is required' },
      { status: 400 },
    )
  }

  try {
    const cache = getPriceHistoryCacheAdapter()

    const filterHash = crypto
      .createHash('md5')
      .update(JSON.stringify({ q: q?.toLowerCase() }))
      .digest('hex')
      .slice(0, 12)

    const cacheKey = `comp:${cnpj}:${filterHash}`

    // Try cache first
    const cached = await cache.get<CompetitorProfileResult>(cacheKey)
    if (cached) {
      return NextResponse.json({
        ...cached,
        cache_hit: true,
        query_time_ms: Date.now() - startTime,
      })
    }

    // Try pre-computed materialized view first
    const { data: preComputed } = await supabase
      .from('competitor_bid_patterns')
      .select('*')
      .eq('cnpj', cnpj)
      .maybeSingle()

    // Fetch recent bids
    // When q is provided, query from tenders (textSearch works on primary table)
    // When no q, query from competitors directly (simpler, faster)
    let bidsData: Array<Record<string, unknown>> | null = null
    let error: { message: string } | null = null

    if (q) {
      // Query from tenders with textSearch, then filter competitors by cnpj
      const result = await supabase
        .from('tenders')
        .select(
          'id, objeto, orgao_nome, uf, modalidade_nome, valor_estimado, data_encerramento, competitors!inner(id, cnpj, nome, porte, uf_fornecedor, valor_proposta, situacao)',
        )
        .textSearch('objeto', q, { type: 'websearch', config: 'portuguese' })
        .eq('competitors.cnpj', cnpj)
        .gt('competitors.valor_proposta', 0)
        .order('data_encerramento', { ascending: false })
        .limit(100)

      if (result.error) {
        error = result.error
      } else {
        // Flatten: one row per competitor bid
        bidsData = (result.data || []).flatMap((tender: Record<string, unknown>) => {
          const comps = (tender.competitors || []) as Array<Record<string, unknown>>
          return comps.map((comp) => ({
            ...comp,
            tenders: {
              id: tender.id,
              objeto: tender.objeto,
              orgao_nome: tender.orgao_nome,
              uf: tender.uf,
              modalidade_nome: tender.modalidade_nome,
              valor_estimado: tender.valor_estimado,
              data_encerramento: tender.data_encerramento,
            },
          }))
        })
      }
    } else {
      // No text search needed — query from competitors directly
      const result = await supabase
        .from('competitors')
        .select(
          'id, cnpj, nome, porte, uf_fornecedor, valor_proposta, situacao, tender_id, tenders!inner(id, objeto, orgao_nome, uf, modalidade_nome, valor_estimado, data_encerramento)',
        )
        .eq('cnpj', cnpj)
        .gt('valor_proposta', 0)
        .order('tenders(data_encerramento)', { ascending: false })
        .limit(100)

      bidsData = result.data as Array<Record<string, unknown>> | null
      error = result.error
    }


    if (error) {
      console.error('Competitor profile query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!bidsData || bidsData.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum registro encontrado para este CNPJ' },
        { status: 404 },
      )
    }

    // Extract competitor identity from first record
    const firstRecord = bidsData[0]
    const nome = (firstRecord.nome as string) || 'N/I'
    const porte = normalizePorte(firstRecord.porte as string | null)
    const uf = (firstRecord.uf_fornecedor as string) || 'N/I'

    // Build recent_bids and collect stats
    const recentBids: CompetitorProfileResult['recent_bids'] = []
    const allBidValues: number[] = []
    const allDiscounts: number[] = []
    let totalWins = 0
    const modalidadeCount = new Map<string, number>()
    const ufCount = new Map<string, number>()
    const monthlyMap = new Map<string, { bids: number; wins: number; bidSum: number }>()
    const dates: string[] = []

    for (const bid of bidsData) {
      const tender = bid.tenders as unknown as {
        id: string
        objeto: string
        orgao_nome: string
        uf: string
        modalidade_nome: string
        valor_estimado: number
        data_encerramento: string
      }

      const valorProposta = bid.valor_proposta as number
      const valorEstimado = tender.valor_estimado || 0
      const discountPct = valorEstimado > 0
        ? round2(((valorEstimado - valorProposta) / valorEstimado) * 100)
        : 0
      const won = WINNER_SITUACOES.includes((bid.situacao as string) || '')
      const dataStr = tender.data_encerramento || ''

      if (won) totalWins++

      allBidValues.push(valorProposta)
      if (valorEstimado > 0) allDiscounts.push(discountPct)

      // Track modalidades
      const mod = tender.modalidade_nome || 'N/I'
      modalidadeCount.set(mod, (modalidadeCount.get(mod) || 0) + 1)

      // Track UFs
      const tenderUf = tender.uf || 'N/I'
      ufCount.set(tenderUf, (ufCount.get(tenderUf) || 0) + 1)

      // Track monthly activity
      const month = dataStr.slice(0, 7)
      if (month) {
        const entry = monthlyMap.get(month) || { bids: 0, wins: 0, bidSum: 0 }
        entry.bids++
        if (won) entry.wins++
        entry.bidSum += valorProposta
        monthlyMap.set(month, entry)
      }

      if (dataStr) dates.push(dataStr)

      recentBids.push({
        tender_id: tender.id,
        objeto: tender.objeto || '',
        orgao: tender.orgao_nome || '',
        uf: tenderUf,
        data: dataStr,
        valor_proposta: valorProposta,
        valor_estimado: valorEstimado,
        discount_pct: discountPct,
        situacao: (bid.situacao as string) || 'N/I',
        won,
      })
    }

    // Compute aggregate stats
    const totalBids = bidsData.length
    const avgBid = round2(mean(allBidValues))
    const medianBid = round2(median(allBidValues))
    const avgDiscount = round2(mean(allDiscounts))
    const medianDiscount = round2(median(allDiscounts))
    const minBid = allBidValues.length > 0 ? round2(Math.min(...allBidValues)) : 0
    const maxBid = allBidValues.length > 0 ? round2(Math.max(...allBidValues)) : 0

    const stats = {
      total_bids: totalBids,
      total_wins: totalWins,
      win_rate: totalBids > 0 ? round2((totalWins / totalBids) * 100) : 0,
      avg_bid: avgBid,
      median_bid: medianBid,
      avg_discount: avgDiscount,
      median_discount: medianDiscount,
      min_bid: minBid,
      max_bid: maxBid,
    }

    // If pre-computed data exists, override stats where available
    if (preComputed) {
      if (preComputed.total_bids != null) stats.total_bids = preComputed.total_bids
      if (preComputed.total_wins != null) stats.total_wins = preComputed.total_wins
      if (preComputed.win_rate != null) stats.win_rate = round2(preComputed.win_rate)
      if (preComputed.avg_discount != null) stats.avg_discount = round2(preComputed.avg_discount)
      if (preComputed.median_discount != null) stats.median_discount = round2(preComputed.median_discount)
    }

    // Compute behavior — CV on discount percentages (not absolute bids) for meaningful consistency
    const cv = allDiscounts.length >= 2 && avgDiscount !== 0
      ? (stdDeviation(allDiscounts) / Math.abs(avgDiscount)) * 100
      : 0

    // Sort discounts for typical range (p10 to p90)
    const sortedDiscounts = [...allDiscounts].sort((a, b) => a - b)
    const p10Idx = Math.floor(sortedDiscounts.length * 0.1)
    const p90Idx = Math.min(Math.floor(sortedDiscounts.length * 0.9), sortedDiscounts.length - 1)

    const behavior = {
      aggressiveness: classifyAggressiveness(medianDiscount),
      typical_discount_range: {
        min: sortedDiscounts.length > 0 ? round2(sortedDiscounts[p10Idx]) : 0,
        max: sortedDiscounts.length > 0 ? round2(sortedDiscounts[p90Idx]) : 0,
      },
      consistency: classifyConsistency(cv),
      preferred_modalidades: Array.from(modalidadeCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([m]) => m),
      active_ufs: Array.from(ufCount.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([u]) => u),
    }

    // Monthly activity
    const monthly_activity = Array.from(monthlyMap.entries())
      .map(([month, data]) => ({
        month,
        bids: data.bids,
        wins: data.wins,
        avg_bid: round2(data.bidSum / data.bids),
      }))
      .sort((a, b) => a.month.localeCompare(b.month))

    // First / last seen
    const sortedDates = dates.sort()
    const first_seen = sortedDates.length > 0 ? sortedDates[0] : null
    const last_seen = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null

    const result: CompetitorProfileResult = {
      cnpj,
      nome,
      porte,
      uf,
      stats,
      behavior,
      recent_bids: recentBids,
      monthly_activity,
      first_seen,
      last_seen,
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
    console.error('Competitor profile error:', e)
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
