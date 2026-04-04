import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'

export const maxDuration = 30

/**
 * POST /api/lance-simulator
 * Analyzes competitor bid patterns and simulates win probability.
 *
 * Strategy:
 *  1. Look for competitors who bid on THIS tender (ideal case)
 *  2. If none, look for historical bids on similar tenders (same CNAE/segment)
 *  3. If still none, use market-average estimates for the modality
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!hasFeature(user, 'bidding_bot') && !user.isPlatformAdmin) {
      return NextResponse.json({ error: 'Recurso disponível no plano Enterprise' }, { status: 403 })
    }

    const { tenderId, valorEstimado, meuDesconto } = await request.json()
    console.log('[lance-simulator] Input:', { tenderId, valorEstimado, meuDesconto, meuDescontoType: typeof meuDesconto })
    if (!tenderId || !valorEstimado) return NextResponse.json({ error: 'tenderId e valorEstimado obrigatórios' }, { status: 400 })

    const supabase = await createClient()

    // ── 1. Get tender info ──────────────────────────────────────────────
    const { data: tender } = await supabase
      .from('tenders')
      .select('objeto, orgao_nome, cnae_classificados, modalidade_nome')
      .eq('id', tenderId)
      .single()

    // ── 2. Get direct competitors on THIS tender ────────────────────────
    const { data: directCompetitors } = await supabase
      .from('competitors')
      .select('cnpj, nome, valor_proposta, situacao')
      .eq('tender_id', tenderId)
      .not('valor_proposta', 'is', null)
      .order('valor_proposta', { ascending: true })

    let competitors = directCompetitors || []
    let dataSource: 'direct' | 'similar' | 'market' = 'direct'
    console.log('[lance-simulator] Direct competitors:', competitors.length)

    // ── 3. Fallback: similar tenders if no direct competitors ───────────
    if (competitors.length === 0) {
      dataSource = 'similar'

      // Find similar tenders by keyword overlap in objeto
      const keywords = (tender?.objeto || '')
        .toLowerCase()
        .split(/\s+/)
        .filter((w: string) => w.length > 4)
        .slice(0, 5)

      if (keywords.length > 0) {
        // Search for competitors in similar tenders
        const searchPattern = keywords.slice(0, 3).join(' | ')
        console.log('[lance-simulator] Similar search pattern:', searchPattern)
        const { data: similarTenders, error: searchErr } = await supabase
          .from('tenders')
          .select('id')
          .neq('id', tenderId)
          .textSearch('objeto', searchPattern, { type: 'websearch', config: 'portuguese' })
          .limit(20)

        if (searchErr) {
          console.error('[lance-simulator] textSearch error:', searchErr.message)
        }

        console.log('[lance-simulator] Similar tenders found:', similarTenders?.length || 0)

        if (similarTenders && similarTenders.length > 0) {
          const tenderIds = similarTenders.map(t => t.id)
          const { data: similarComps } = await supabase
            .from('competitors')
            .select('cnpj, nome, valor_proposta, situacao')
            .in('tender_id', tenderIds)
            .not('valor_proposta', 'is', null)
            .order('valor_proposta', { ascending: true })
            .limit(100)

          competitors = similarComps || []
          console.log('[lance-simulator] Similar competitors:', competitors.length)
        }
      }
    }

    // ── 4. Build discount distribution ──────────────────────────────────
    // For similar tenders, normalize values to percentage discount
    let descontos: number[]

    if (dataSource === 'direct') {
      descontos = competitors
        .filter(c => c.valor_proposta && c.valor_proposta > 0)
        .map(c => ((valorEstimado - c.valor_proposta) / valorEstimado * 100))
        .filter(d => d > -50 && d < 80)
        .sort((a, b) => a - b)
    } else {
      // For similar tenders, each tender may have different estimated values
      // Group by tender and calculate relative discounts within each tender
      const byTender = new Map<string, number[]>()
      for (const c of competitors) {
        if (!c.valor_proposta || c.valor_proposta <= 0) continue
        // We can't know the exact estimated value of each similar tender,
        // so use the winner's value as baseline and calculate relative spread
        const key = 'similar'
        if (!byTender.has(key)) byTender.set(key, [])
        byTender.get(key)!.push(c.valor_proposta)
      }

      // Calculate discounts relative to the max bid in similar tenders
      const allValues = competitors
        .map(c => c.valor_proposta)
        .filter((v): v is number => v != null && v > 0)
        .sort((a, b) => b - a)

      if (allValues.length > 0) {
        const maxBid = allValues[0]
        descontos = allValues
          .map(v => ((maxBid - v) / maxBid) * 100)
          .filter(d => d >= 0 && d < 80)
          .sort((a, b) => a - b)
      } else {
        descontos = []
      }
    }

    console.log('[lance-simulator] After queries:', { dataSource, competitorsCount: competitors.length, descontosCount: descontos.length, descontosFirst5: descontos.slice(0, 5) })

    // ── 5. Market fallback: generate synthetic distribution ─────────────
    if (descontos.length === 0) {
      dataSource = 'market'
      // Typical public procurement discount distribution in Brazil
      // Based on pregão eletrônico averages: median ~15%, std ~8%
      descontos = [3, 5, 7, 8, 10, 12, 13, 14, 15, 15, 16, 17, 18, 20, 22, 25, 28, 30, 35]
    }

    // ── 6. Calculate win probability ────────────────────────────────────
    let probabilidadeVitoria = 0
    if (descontos.length > 0 && meuDesconto != null) {
      const melhorQueEu = descontos.filter(d => d > meuDesconto).length
      probabilidadeVitoria = Math.round((1 - melhorQueEu / descontos.length) * 100)
      // Clamp to reasonable range
      probabilidadeVitoria = Math.max(0, Math.min(100, probabilidadeVitoria))
    }

    console.log('[lance-simulator] Probability:', { probabilidadeVitoria, meuDesconto, descontosLen: descontos.length, dataSource, melhorQueEu: descontos.filter(d => d > meuDesconto).length })

    // ── 7. Histogram ────────────────────────────────────────────────────
    const faixas = [
      { faixa: '0-5%', min: 0, max: 5 },
      { faixa: '5-10%', min: 5, max: 10 },
      { faixa: '10-15%', min: 10, max: 15 },
      { faixa: '15-20%', min: 15, max: 20 },
      { faixa: '20-30%', min: 20, max: 30 },
      { faixa: '30%+', min: 30, max: 100 },
    ]
    const distribuicaoDescontos = faixas.map(f => ({
      faixa: f.faixa,
      count: descontos.filter(d => d >= f.min && d < f.max).length,
    }))

    // ── 8. Competitor stats enrichment ──────────────────────────────────
    const cnpjs = competitors.map(c => c.cnpj).filter(Boolean).slice(0, 20)
    let patterns: any[] = []
    if (cnpjs.length > 0) {
      const { data } = await supabase
        .from('competitor_stats')
        .select('cnpj, razao_social, total_participacoes, total_vitorias, win_rate, desconto_medio')
        .in('cnpj', cnpjs)
      patterns = data || []
    }

    const patternMap = new Map(patterns.map(p => [p.cnpj, p]))
    const concorrentes = (dataSource === 'direct' ? competitors : []).slice(0, 10).map(c => {
      const p = patternMap.get(c.cnpj)
      const desconto = c.valor_proposta ? ((valorEstimado - c.valor_proposta) / valorEstimado * 100) : 0
      return {
        nome: p?.razao_social || c.nome || c.cnpj,
        cnpj: c.cnpj,
        valorProposta: c.valor_proposta,
        desconto: Math.round(desconto * 100) / 100,
        isWinner: c.situacao === 'Vencedor',
        totalParticipacoes: p?.total_participacoes || 0,
        totalVitorias: p?.total_vitorias || 0,
        winRate: p?.win_rate ? Math.round(p.win_rate * 100) : 0,
        descontoMedio: p?.desconto_medio || 0,
      }
    })

    // ── 9. Recommendations ──────────────────────────────────────────────
    const medianDesconto = descontos[Math.floor(descontos.length / 2)] || 15
    const recomendacao = {
      lanceMinimo: Math.round(valorEstimado * (1 - (medianDesconto - 2) / 100)),
      lanceSugerido: Math.round(valorEstimado * (1 - medianDesconto / 100)),
      lanceAgressivo: Math.round(valorEstimado * (1 - (medianDesconto + 5) / 100)),
    }

    return NextResponse.json({
      probabilidadeVitoria,
      concorrentes,
      recomendacao,
      distribuicaoDescontos,
      descontoMediano: Math.round(medianDesconto * 100) / 100,
      totalConcorrentes: dataSource === 'direct' ? competitors.length : 0,
      dataSource,
      dataSourceLabel: dataSource === 'direct'
        ? 'Dados reais desta licitação'
        : dataSource === 'similar'
          ? `Estimativa baseada em ${competitors.length} propostas de licitações similares`
          : 'Estimativa baseada em médias do mercado de pregão eletrônico',
    })
  } catch (err) {
    console.error('[lance-simulator]', err)
    return NextResponse.json({ error: 'Erro na simulação' }, { status: 500 })
  }
}
