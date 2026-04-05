import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import {
  computeDiscountRatioStats,
  fitWinProbabilityModel,
  generateRecommendations,
  generateWinCurve,
  assessContextualConfidence,
  type ContextualBid,
} from '@licitagram/price-history'
import { getPriceHistoryCacheAdapter, checkRedisRateLimit } from '@/lib/price-history-cache'
import crypto from 'crypto'
import OpenAI from 'openai'

export const maxDuration = 30

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: { 'HTTP-Referer': 'https://licitagram.com', 'X-Title': 'Licitagram' },
})

/**
 * POST /api/price-history/contextual-pricing
 *
 * Context-aware pricing engine using discount_ratio normalization
 * and logistic regression for win probability.
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now()

  const supabase = await createClient()
  const user = await getUserWithPlan()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limiting
  const rateLimit = await checkRedisRateLimit(`ctx-pricing:${user.userId}`, 15, 60)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Muitas requisições. Tente novamente em breve.', retry_after: rateLimit.retryAfter },
      { status: 429 },
    )
  }

  const body = await req.json()
  const { query, valor_estimado, uf, modalidade, num_competitors } = body as {
    query?: string
    valor_estimado?: number
    uf?: string
    modalidade?: string
    num_competitors?: number
  }

  if (!query || query.trim().length < 3) {
    return NextResponse.json({ error: 'Query deve ter pelo menos 3 caracteres' }, { status: 400 })
  }
  if (!valor_estimado || valor_estimado <= 0) {
    return NextResponse.json({ error: 'valor_estimado é obrigatório e deve ser positivo' }, { status: 400 })
  }

  const q = query.trim()
  const avgCompetitors = num_competitors || 5

  try {
    const cache = getPriceHistoryCacheAdapter()
    const filterHash = crypto
      .createHash('md5')
      .update(JSON.stringify({ q: q.toLowerCase(), ve: valor_estimado, uf, modalidade }))
      .digest('hex')
      .slice(0, 12)
    const cacheKey = `ctx-pricing:${filterHash}`

    // Try cache first
    const cached = await cache.get<object>(cacheKey)
    if (cached) {
      return NextResponse.json({ ...cached, cache_hit: true, query_time_ms: Date.now() - startTime })
    }

    // Step 1: Fetch contextual bids (±50% of valor_estimado)
    let bandFactor = 0.5
    let bandWidened = false

    let { data: bids, error } = await supabase.rpc('get_contextual_bids', {
      p_query: q,
      p_valor_estimado: valor_estimado,
      p_band_factor: bandFactor,
      p_uf: uf || null,
      p_modalidade: modalidade || null,
      p_limit: 500,
    })

    if (error) {
      console.error('Contextual bids RPC error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Step 2: Widen band if too few results
    if (!bids || bids.length < 10) {
      bandFactor = 1.0
      bandWidened = true
      const wider = await supabase.rpc('get_contextual_bids', {
        p_query: q,
        p_valor_estimado: valor_estimado,
        p_band_factor: bandFactor,
        p_uf: uf || null,
        p_modalidade: modalidade || null,
        p_limit: 500,
      })
      if (!wider.error && wider.data && wider.data.length > (bids?.length || 0)) {
        bids = wider.data
      }
    }

    // Step 3: Fallback to keyword-only if still too few
    if (!bids || bids.length < 5) {
      bandFactor = 100 // effectively no price filter
      bandWidened = true
      const fallback = await supabase.rpc('get_contextual_bids', {
        p_query: q,
        p_valor_estimado: valor_estimado,
        p_band_factor: bandFactor,
        p_uf: null,
        p_modalidade: null,
        p_limit: 500,
      })
      if (!fallback.error && fallback.data && fallback.data.length > (bids?.length || 0)) {
        bids = fallback.data
      }
    }

    if (!bids || bids.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum dado encontrado para esta pesquisa e faixa de valor.' },
        { status: 404 },
      )
    }

    // Map to ContextualBid type
    const contextualBids: ContextualBid[] = bids.map((b: any) => ({
      valor_proposta: Number(b.valor_proposta),
      valor_estimado: Number(b.valor_estimado),
      discount_ratio: Number(b.discount_ratio),
      is_winner: Boolean(b.is_winner),
      porte: b.porte || 'N/A',
      uf: b.uf || '',
      modalidade_nome: b.modalidade_nome || '',
      num_competitors: Number(b.num_competitors) || 1,
      data_encerramento: b.data_encerramento || '',
      orgao_nome: b.orgao_nome || '',
      cnpj: b.cnpj || '',
      nome: b.nome || '',
    }))

    // Step 4: Compute statistics
    const stats = computeDiscountRatioStats(contextualBids)

    // Step 5: Fit win probability model
    const model = fitWinProbabilityModel(contextualBids)

    // Step 6: Generate recommendations
    const recommendations = generateRecommendations(valor_estimado, stats, model, avgCompetitors)

    // Step 7: Generate win probability curve
    const winCurve = generateWinCurve(model, valor_estimado, avgCompetitors)

    // Step 8: Assess confidence
    const confidence = assessContextualConfidence(
      stats.overall.count,
      stats.winners.count,
      stats.overall.cv_percent,
      bandWidened,
    )

    // Step 9: Determine band range used
    const bandMin = Math.round(valor_estimado * (1 - bandFactor))
    const bandMax = Math.round(valor_estimado * (1 + bandFactor))

    // Step 10: Get date range from data
    const dates = contextualBids
      .map((b) => b.data_encerramento)
      .filter(Boolean)
      .sort()
    const dateRange = dates.length >= 2
      ? `${dates[0]?.substring(0, 10)} a ${dates[dates.length - 1]?.substring(0, 10)}`
      : 'N/D'

    // Step 11: Generate LLM narrative in parallel (fire and forget pattern for speed)
    let marketSummary = ''
    let keyInsights: string[] = []

    try {
      const llmPromise = openrouter.chat.completions.create({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content:
              'Você é um analista de inteligência de preços para licitações públicas brasileiras. Responda em JSON com { "market_summary": "...", "key_insights": ["...", "...", "..."] }. Use dados fornecidos — NUNCA invente números. Seja conciso (3-4 frases no summary, 3-5 insights). Em português.',
          },
          {
            role: 'user',
            content: `Analise o mercado para "${q}" na faixa de R$${bandMin.toLocaleString('pt-BR')} a R$${bandMax.toLocaleString('pt-BR')}.

Dados estatísticos (desconto sobre valor estimado):
- Amostras: ${stats.overall.count} propostas, ${stats.winners.count} vencedoras
- Desconto médio geral: ${((1 - stats.overall.mean) * 100).toFixed(1)}%
- Desconto mediano vencedores: ${((1 - stats.winners.median) * 100).toFixed(1)}%
- Faixa de desconto vencedores: ${((1 - stats.winners.p75) * 100).toFixed(1)}% a ${((1 - stats.winners.p25) * 100).toFixed(1)}%
- CV: ${stats.overall.cv_percent.toFixed(1)}%
- Modelo P(win): ${model.type}
- Período: ${dateRange}

Recomendações geradas:
- Agressivo: R$${recommendations[0].price.toLocaleString('pt-BR')} (${recommendations[0].win_probability.toFixed(0)}% chance)
- Competitivo: R$${recommendations[1].price.toLocaleString('pt-BR')} (${recommendations[1].win_probability.toFixed(0)}% chance)
- Seguro: R$${recommendations[2].price.toLocaleString('pt-BR')} (${recommendations[2].win_probability.toFixed(0)}% chance)`,
          },
        ],
        max_tokens: 1024,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      })

      const llmResult = await Promise.race([
        llmPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
      ])

      if (llmResult && 'choices' in llmResult) {
        const content = llmResult.choices[0]?.message?.content || '{}'
        try {
          const parsed = JSON.parse(content)
          marketSummary = parsed.market_summary || ''
          keyInsights = parsed.key_insights || []
        } catch { /* LLM returned invalid JSON — fine, we have stats */ }
      }
    } catch {
      // LLM failed — that's OK, stats-based recommendations are the core value
    }

    // Build response
    const result = {
      recommendations,
      win_curve: winCurve,
      context: {
        band: {
          min: bandMin,
          max: bandMax,
          label: `R$ ${formatCompact(bandMin)} – ${formatCompact(bandMax)}`,
        },
        sample_size: stats.overall.count,
        winner_count: stats.winners.count,
        confidence,
        band_widened: bandWidened,
        date_range: dateRange,
      },
      discount_stats: stats,
      model_type: model.type,
      market_summary: marketSummary,
      key_insights: keyInsights,
      query_time_ms: Date.now() - startTime,
    }

    // Cache for 30 minutes
    cache.set(cacheKey, result, 1800).catch(() => {})

    return NextResponse.json({ ...result, cache_hit: false })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro interno'
    console.error('Contextual pricing error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} mil`
  return n.toLocaleString('pt-BR')
}
