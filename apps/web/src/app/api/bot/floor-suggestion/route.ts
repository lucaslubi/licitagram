/**
 * POST /api/bot/floor-suggestion
 *
 * The Floor Optimizer. Takes a pregão item description + optional
 * CATMAT code and returns a recommended `valor final mínimo` based on:
 *
 *   1. Historical prices from price_references (PNCP, Dados Abertos,
 *      Painel de Preços, BPS Saúde).
 *   2. Configurable margin — how aggressively the client wants to undercut
 *      the historical median.
 *   3. Confidence score — higher when more data points + recent dates.
 *
 * This is the Phase 2 baseline. Phase 3 replaces the median heuristic
 * with a predictive model trained on full tender + winner history.
 *
 * Output:
 *   {
 *     suggested_floor: number,
 *     reference_median: number,
 *     reference_p25: number,
 *     reference_p75: number,
 *     sample_size: number,
 *     confidence: 'low' | 'medium' | 'high',
 *     sources: Array<{ fonte, count, avg }>,
 *     explanation: string
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan, hasActiveSubscription } from '@/lib/auth-helpers'

interface PriceRow {
  valor_unitario: number
  fonte: string
  data_referencia: string
  confiabilidade: number | null
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0
  const idx = (sortedValues.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sortedValues[lo]
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (idx - lo)
}

function median(values: number[]): number {
  return percentile(values, 0.5)
}

export async function POST(req: NextRequest) {
  try {
    const planUser = await getUserWithPlan()
    if (!planUser) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }
    if (!hasActiveSubscription(planUser)) {
      return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
    }

    const body = await req.json()
    const {
      descricao,
      catmat_catser,
      unidade_medida,
      margem_percentual,
      orgao_uf,
    } = body as {
      descricao?: string
      catmat_catser?: string
      unidade_medida?: string
      margem_percentual?: number
      orgao_uf?: string
    }

    if (!descricao && !catmat_catser) {
      return NextResponse.json(
        { error: 'Envie descricao ou catmat_catser' },
        { status: 400 },
      )
    }

    // Default margin: bid at 93% of the historical median — aggressive but
    // leaves a 7% safety margin for profit erosion.
    const margin = typeof margem_percentual === 'number' ? margem_percentual : 7
    if (margin < 0 || margin > 90) {
      return NextResponse.json({ error: 'margem_percentual deve estar entre 0 e 90' }, { status: 400 })
    }

    const supabase = await createClient()

    // Query: prefer CATMAT exact match, fall back to full-text on description.
    let query = supabase
      .from('price_references')
      .select('valor_unitario, fonte, data_referencia, confiabilidade')
      .order('data_referencia', { ascending: false })
      .limit(500)

    if (catmat_catser) {
      query = query.eq('catmat_catser', catmat_catser)
    } else if (descricao) {
      // Full-text search via ts_query. Simple plain-text to_tsquery fallback.
      const cleaned = descricao.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim()
      if (cleaned.length >= 3) {
        query = query.textSearch('descricao', cleaned, {
          type: 'plain',
          config: 'portuguese',
        })
      }
    }

    if (unidade_medida) {
      query = query.eq('unidade_medida', unidade_medida)
    }
    if (orgao_uf && /^[A-Z]{2}$/.test(orgao_uf)) {
      query = query.eq('orgao_uf', orgao_uf)
    }

    const { data: rows, error } = await query
    if (error) {
      console.error('[API bot/floor-suggestion] query error:', error)
      return NextResponse.json({ error: 'Erro ao consultar preços' }, { status: 500 })
    }

    const samples = (rows ?? []) as PriceRow[]

    if (samples.length === 0) {
      return NextResponse.json({
        suggested_floor: null,
        reference_median: null,
        reference_p25: null,
        reference_p75: null,
        sample_size: 0,
        confidence: 'low' as const,
        sources: [],
        explanation:
          'Sem histórico de preços para este item. Configure o valor final mínimo manualmente ou use uma cotação externa.',
      })
    }

    // Filter obvious outliers: keep values within 3x the median.
    const values = samples.map((s) => s.valor_unitario).filter((v) => v > 0)
    values.sort((a, b) => a - b)
    const med = median(values)
    const trimmed = values.filter((v) => v >= med * 0.2 && v <= med * 3)
    const sorted = trimmed.length >= 3 ? trimmed : values

    const p25 = percentile(sorted, 0.25)
    const p50 = percentile(sorted, 0.5)
    const p75 = percentile(sorted, 0.75)

    const suggestedFloor = Math.round(p50 * (1 - margin / 100) * 100) / 100

    // Confidence heuristic.
    let confidence: 'low' | 'medium' | 'high' = 'low'
    if (sorted.length >= 10 && sorted.length < 30) confidence = 'medium'
    if (sorted.length >= 30) confidence = 'high'

    // Group by source.
    const bySource: Record<string, { count: number; total: number }> = {}
    for (const s of samples) {
      const k = s.fonte
      if (!bySource[k]) bySource[k] = { count: 0, total: 0 }
      bySource[k].count++
      bySource[k].total += s.valor_unitario
    }
    const sources = Object.entries(bySource).map(([fonte, v]) => ({
      fonte,
      count: v.count,
      avg: Math.round((v.total / v.count) * 100) / 100,
    }))

    const explanation =
      `Com base em ${sorted.length} preços históricos ${catmat_catser ? `do CATMAT ${catmat_catser}` : 'similares'}. ` +
      `Mediana R$ ${p50.toFixed(2)}, intervalo interquartil R$ ${p25.toFixed(2)}–R$ ${p75.toFixed(2)}. ` +
      `Sugerimos R$ ${suggestedFloor.toFixed(2)} (${margin}% abaixo da mediana). Confiança: ${confidence}.`

    return NextResponse.json({
      suggested_floor: suggestedFloor,
      reference_median: Math.round(p50 * 100) / 100,
      reference_p25: Math.round(p25 * 100) / 100,
      reference_p75: Math.round(p75 * 100) / 100,
      sample_size: sorted.length,
      confidence,
      sources,
      explanation,
      margem_percentual: margin,
    })
  } catch (err) {
    console.error('[API bot/floor-suggestion] error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
