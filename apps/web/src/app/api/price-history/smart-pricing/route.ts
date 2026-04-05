import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import {
  computeStatistics,
  analyzeTrend,
  filterOutliers,
  deduplicateRecords,
  type PriceRecord,
  type PriceStatistics,
  type PriceTrend,
} from '@licitagram/price-history'
import { getPriceHistoryCacheAdapter, checkRedisRateLimit } from '@/lib/price-history-cache'
import crypto from 'crypto'
import { callAIWithFallback } from '@/lib/ai-client'

export const maxDuration = 60

// ─── Types ───────────────────────────────────────────────────────────────────

interface SmartPricingRecommendation {
  strategy: 'agressivo' | 'competitivo' | 'seguro'
  price: number
  rationale: string
  win_probability_estimate: number
  risk_level: 'baixo' | 'medio' | 'alto'
}

interface SmartPricingResult {
  recommendations: SmartPricingRecommendation[]
  market_summary: string
  key_insights: string[]
  data_quality: {
    sample_size: number
    confidence: 'alta' | 'media' | 'baixa'
    date_range: string
  }
}

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Voce e um especialista em precificacao de licitacoes publicas brasileiras.
Analise os dados de mercado fornecidos e gere 3 recomendacoes de preco:

1. AGRESSIVO: Preco baixo para maximizar chance de vitoria. Alto risco de margem.
2. COMPETITIVO: Equilibrio entre competitividade e margem. Risco moderado.
3. SEGURO: Preco conservador com boa margem. Menor chance de vitoria.

Para cada recomendacao, forneca:
- O preco sugerido (numero)
- Justificativa baseada nos dados
- Estimativa de probabilidade de vitoria (0-100%)
- Nivel de risco

Tambem forneca:
- Um resumo analitico do mercado (2-3 frases)
- 3-5 insights-chave sobre o mercado

Responda APENAS em JSON valido no formato especificado abaixo. Nao inclua markdown, comentarios ou texto fora do JSON.

Formato:
{
  "recommendations": [
    {
      "strategy": "agressivo",
      "price": 0,
      "rationale": "...",
      "win_probability_estimate": 0,
      "risk_level": "alto"
    },
    {
      "strategy": "competitivo",
      "price": 0,
      "rationale": "...",
      "win_probability_estimate": 0,
      "risk_level": "medio"
    },
    {
      "strategy": "seguro",
      "price": 0,
      "rationale": "...",
      "win_probability_estimate": 0,
      "risk_level": "baixo"
    }
  ],
  "market_summary": "...",
  "key_insights": ["...", "...", "..."]
}`

// ─── Helpers ─────────────────────────────────────────────────────────────────

const UF_LIST = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
]

function mapPorte(porte: string | null | undefined): PriceRecord['supplier_porte'] {
  if (!porte) return 'N/A'
  const upper = porte.toUpperCase()
  if (upper.includes('ME') && !upper.includes('MEDIO')) return 'ME'
  if (upper.includes('EPP')) return 'EPP'
  if (upper.includes('MEDIO') || upper.includes('MEDIA')) return 'MEDIO'
  if (upper.includes('GRANDE')) return 'GRANDE'
  return 'N/A'
}

function buildUserMessage(
  query: string,
  stats: PriceStatistics,
  trend: PriceTrend,
  targetMargin: number | undefined,
  winnerAvgDiscount: number | null,
): string {
  const topUfs = stats.by_uf
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((u) => `${u.key}: ${u.count} registros, mediana R$${u.median.toFixed(2)}`)
    .join('; ')

  const byPorte = stats.by_porte
    .map((p) => `${p.key}: ${p.count} registros, mediana R$${p.median.toFixed(2)}`)
    .join('; ')

  let msg = `Consulta: "${query}"

Estatisticas de mercado:
- Amostra: ${stats.count} registros
- Media: R$${stats.mean.toFixed(2)}
- Mediana: R$${stats.median.toFixed(2)}
- P25: R$${stats.percentile_25.toFixed(2)}
- P75: R$${stats.percentile_75.toFixed(2)}
- Minimo: R$${stats.min.toFixed(2)}
- Maximo: R$${stats.max.toFixed(2)}
- Desvio padrao: R$${stats.std_deviation.toFixed(2)}
- Coeficiente de variacao: ${stats.cv_percent.toFixed(1)}%
- Confianca dos dados: ${stats.confidence}

Top UFs: ${topUfs || 'N/D'}
Por porte: ${byPorte || 'N/D'}

Tendencia: ${trend.direction}${trend.variation_12m_percent != null ? ` (${trend.variation_12m_percent > 0 ? '+' : ''}${trend.variation_12m_percent.toFixed(1)}% em 12 meses)` : ''}`

  if (winnerAvgDiscount != null) {
    msg += `\nDesconto medio dos vencedores: ${winnerAvgDiscount.toFixed(1)}%`
  }

  if (targetMargin != null) {
    msg += `\n\nMargem alvo do usuario: ${targetMargin}%`
  }

  return msg
}

function parseAIResponse(content: string): SmartPricingResult | null {
  try {
    // Strip potential markdown fences
    let cleaned = content.trim()
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    const parsed = JSON.parse(cleaned)

    // Validate structure
    if (
      !parsed.recommendations ||
      !Array.isArray(parsed.recommendations) ||
      parsed.recommendations.length < 3
    ) {
      return null
    }

    for (const rec of parsed.recommendations) {
      if (
        !rec.strategy ||
        typeof rec.price !== 'number' ||
        !rec.rationale ||
        typeof rec.win_probability_estimate !== 'number' ||
        !rec.risk_level
      ) {
        return null
      }
      // Clamp probability
      rec.win_probability_estimate = Math.max(0, Math.min(100, Math.round(rec.win_probability_estimate)))
    }

    if (!parsed.market_summary || !Array.isArray(parsed.key_insights)) {
      return null
    }

    return parsed as SmartPricingResult
  } catch {
    return null
  }
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!hasFeature(user, 'competitive_intel') && !user.isPlatformAdmin) {
      return NextResponse.json(
        { error: 'Recurso disponivel no plano Profissional ou Enterprise' },
        { status: 403 },
      )
    }

    // Rate limit: 10 req/min (AI calls are expensive)
    const rateLimit = await checkRedisRateLimit(`smart:${user.userId}`, 10, 60)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Muitas requisicoes. Tente novamente em breve.', retry_after: rateLimit.retryAfter },
        { status: 429 },
      )
    }

    const body = await request.json()
    const { query, target_margin, uf, modalidade } = body as {
      query: string
      target_margin?: number
      uf?: string
      modalidade?: string
    }

    if (!query || query.trim().length < 3) {
      return NextResponse.json(
        { error: 'Query deve ter pelo menos 3 caracteres' },
        { status: 400 },
      )
    }

    if (uf && !UF_LIST.includes(uf.toUpperCase())) {
      return NextResponse.json({ error: 'UF invalida' }, { status: 400 })
    }

    // ── Cache check ────────────────────────────────────────────────────────
    const cache = getPriceHistoryCacheAdapter()
    const cacheHash = crypto
      .createHash('md5')
      .update(JSON.stringify({ q: query.toLowerCase().trim(), target_margin, uf, modalidade }))
      .digest('hex')
      .slice(0, 12)
    const cacheKey = `smart:${cacheHash}`

    const cached = await cache.get<SmartPricingResult & { statistics: PriceStatistics; trend: PriceTrend }>(cacheKey)
    if (cached) {
      return NextResponse.json({ ...cached, cache_hit: true })
    }

    // ── Fetch market data from Supabase ────────────────────────────────────
    const supabase = await createClient()

    let dbQuery = supabase
      .from('tenders')
      .select(
        'id, objeto, valor_estimado, valor_homologado, uf, municipio, modalidade_nome, orgao_nome, data_publicacao, data_encerramento, competitors!inner(cnpj, nome, valor_proposta, situacao, porte, uf_fornecedor)',
        { count: 'exact' },
      )
      .textSearch('objeto', query.trim(), { type: 'websearch', config: 'portuguese' })
      .not('valor_homologado', 'is', null)

    if (uf) {
      dbQuery = dbQuery.eq('uf', uf.toUpperCase())
    }
    if (modalidade) {
      dbQuery = dbQuery.eq('modalidade_nome', modalidade)
    }

    dbQuery = dbQuery.order('data_encerramento', { ascending: false }).limit(200)

    const { data, error: dbError } = await dbQuery

    if (dbError) {
      console.error('[smart-pricing] DB error:', dbError)
      return NextResponse.json({ error: 'Erro ao buscar dados de mercado' }, { status: 500 })
    }

    // ── Transform into PriceRecords ────────────────────────────────────────
    const records: PriceRecord[] = []

    if (data) {
      for (const tender of data) {
        const competitors = (tender.competitors || []) as Array<{
          cnpj: string | null
          nome: string | null
          valor_proposta: number | null
          situacao: string | null
          porte: string | null
          uf_fornecedor: string | null
        }>

        if (competitors.length > 0) {
          for (const comp of competitors) {
            if (!comp.valor_proposta || comp.valor_proposta <= 0) continue
            records.push({
              id: `${tender.id}-${comp.cnpj || 'unknown'}`,
              licitacao_id: tender.id,
              licitacao_numero: tender.id,
              licitacao_modalidade: tender.modalidade_nome || 'N/I',
              orgao_nome: tender.orgao_nome || 'N/I',
              orgao_uf: tender.uf || '',
              orgao_municipio: tender.municipio || '',
              fonte: 'pncp',
              item_description: tender.objeto || '',
              item_unit: 'SV',
              item_quantity: 1,
              unit_price: comp.valor_proposta,
              total_price: comp.valor_proposta,
              supplier_name: comp.nome || 'N/I',
              supplier_cnpj: comp.cnpj || '',
              supplier_uf: comp.uf_fornecedor || '',
              supplier_porte: mapPorte(comp.porte),
              date_homologation: new Date(tender.data_encerramento || tender.data_publicacao || Date.now()),
              date_opening: new Date(tender.data_publicacao || Date.now()),
              is_valid: true,
              confidence_score: 1,
            })
          }
        } else {
          records.push({
            id: tender.id,
            licitacao_id: tender.id,
            licitacao_numero: tender.id,
            licitacao_modalidade: tender.modalidade_nome || 'N/I',
            orgao_nome: tender.orgao_nome || 'N/I',
            orgao_uf: tender.uf || '',
            orgao_municipio: tender.municipio || '',
            fonte: 'pncp',
            item_description: tender.objeto || '',
            item_unit: 'SV',
            item_quantity: 1,
            unit_price: tender.valor_homologado as number,
            total_price: tender.valor_homologado as number,
            supplier_name: 'N/I',
            supplier_cnpj: '',
            supplier_uf: '',
            supplier_porte: 'N/A',
            date_homologation: new Date(tender.data_encerramento || tender.data_publicacao || Date.now()),
            date_opening: new Date(tender.data_publicacao || Date.now()),
            is_valid: true,
            confidence_score: 0.7,
          })
        }
      }
    }

    if (records.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum dado de mercado encontrado para esta consulta. Tente termos diferentes.' },
        { status: 404 },
      )
    }

    // ── Process records ────────────────────────────────────────────────────
    const dedupedRecords = deduplicateRecords(records)
    const processedRecords = filterOutliers(dedupedRecords)
    const validRecords = processedRecords.filter((r) => r.is_valid)
    const statistics = computeStatistics(validRecords)
    const trend = analyzeTrend(validRecords)

    // ── Compute winner average discount ────────────────────────────────────
    let winnerAvgDiscount: number | null = null
    if (data) {
      const discounts: number[] = []
      for (const tender of data) {
        if (!tender.valor_estimado || tender.valor_estimado <= 0) continue
        const competitors = (tender.competitors || []) as Array<{
          valor_proposta: number | null
          situacao: string | null
        }>
        for (const comp of competitors) {
          if (comp.situacao === 'Vencedor' && comp.valor_proposta && comp.valor_proposta > 0) {
            const discount = ((tender.valor_estimado - comp.valor_proposta) / tender.valor_estimado) * 100
            if (discount > -50 && discount < 80) {
              discounts.push(discount)
            }
          }
        }
      }
      if (discounts.length > 0) {
        winnerAvgDiscount = discounts.reduce((a, b) => a + b, 0) / discounts.length
      }
    }

    // ── Date range for data quality ────────────────────────────────────────
    const dates = validRecords
      .map((r) => r.date_homologation.getTime())
      .filter((d) => !isNaN(d))
      .sort((a, b) => a - b)
    const dateRange = dates.length >= 2
      ? `${new Date(dates[0]).toISOString().slice(0, 10)} a ${new Date(dates[dates.length - 1]).toISOString().slice(0, 10)}`
      : 'N/D'

    // ── Call AI ────────────────────────────────────────────────────────────
    const userMessage = buildUserMessage(query, statistics, trend, target_margin, winnerAvgDiscount)

    let aiResult: Omit<SmartPricingResult, 'data_quality'> | null = null

    try {
      const response = await callAIWithFallback({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 2048,
        temperature: 0.3,
      })

      const content = response.choices[0]?.message?.content || ''
      aiResult = parseAIResponse(content)

      if (!aiResult) {
        console.error('[smart-pricing] Failed to parse AI response:', content.slice(0, 500))
      }
    } catch (aiError) {
      console.error('[smart-pricing] AI call failed:', aiError)
    }

    // ── Fallback: generate recommendations without AI ──────────────────────
    if (!aiResult) {
      const p25 = statistics.percentile_25
      const median = statistics.median
      const p75 = statistics.percentile_75

      aiResult = {
        recommendations: [
          {
            strategy: 'agressivo',
            price: Math.round(p25 * 100) / 100,
            rationale: `Preco baseado no percentil 25 (R$${p25.toFixed(2)}) dos dados de mercado. Posiciona abaixo de 75% dos concorrentes.`,
            win_probability_estimate: 75,
            risk_level: 'alto',
          },
          {
            strategy: 'competitivo',
            price: Math.round(median * 100) / 100,
            rationale: `Preco baseado na mediana (R$${median.toFixed(2)}) dos dados de mercado. Equilibrio entre competitividade e margem.`,
            win_probability_estimate: 50,
            risk_level: 'medio',
          },
          {
            strategy: 'seguro',
            price: Math.round(p75 * 100) / 100,
            rationale: `Preco baseado no percentil 75 (R$${p75.toFixed(2)}) dos dados de mercado. Margem mais confortavel com menor chance de vitoria.`,
            win_probability_estimate: 25,
            risk_level: 'baixo',
          },
        ],
        market_summary: `Analise baseada em ${statistics.count} registros com mediana de R$${median.toFixed(2)}. Tendencia de mercado: ${trend.direction}.`,
        key_insights: [
          `Preco medio de mercado: R$${statistics.mean.toFixed(2)}`,
          `Variacao entre propostas: ${statistics.cv_percent.toFixed(1)}%`,
          `Tendencia: ${trend.direction}${trend.variation_12m_percent != null ? ` (${trend.variation_12m_percent > 0 ? '+' : ''}${trend.variation_12m_percent.toFixed(1)}% em 12m)` : ''}`,
        ],
      }
    }

    // ── Build response ─────────────────────────────────────────────────────
    const result = {
      ...aiResult,
      data_quality: {
        sample_size: statistics.count,
        confidence: statistics.confidence,
        date_range: dateRange,
      },
      statistics,
      trend,
      cache_hit: false,
    }

    // Cache for 30 minutes in background
    cache.set(cacheKey, result, 1800).catch(() => {})

    return NextResponse.json(result)
  } catch (err) {
    console.error('[smart-pricing]', err)
    return NextResponse.json({ error: 'Erro ao gerar precificacao inteligente' }, { status: 500 })
  }
}
