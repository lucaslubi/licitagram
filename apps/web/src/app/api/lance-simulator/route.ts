import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'

export const maxDuration = 30

/**
 * POST /api/lance-simulator
 * Analyzes competitor bid patterns and simulates win probability.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!hasFeature(user, 'bidding_bot') && !user.isPlatformAdmin) {
      return NextResponse.json({ error: 'Recurso disponível no plano Enterprise' }, { status: 403 })
    }

    const { tenderId, valorEstimado, meuDesconto } = await request.json()
    if (!tenderId || !valorEstimado) return NextResponse.json({ error: 'tenderId e valorEstimado obrigatórios' }, { status: 400 })

    const supabase = await createClient()

    // Get tender info
    const { data: tender } = await supabase
      .from('tenders')
      .select('objeto, orgao_nome, cnae_classificados')
      .eq('id', tenderId)
      .single()

    // Get competitors who participated in similar tenders
    const { data: competitors } = await supabase
      .from('competitors')
      .select('cnpj, nome, valor_proposta, situacao')
      .eq('tender_id', tenderId)
      .not('valor_proposta', 'is', null)
      .order('valor_proposta', { ascending: true })

    // Get bid patterns for these competitors
    const cnpjs = (competitors || []).map(c => c.cnpj).filter(Boolean)
    let patterns: any[] = []
    if (cnpjs.length > 0) {
      const { data } = await supabase
        .from('competitor_stats')
        .select('cnpj, razao_social, total_participacoes, total_vitorias, win_rate, desconto_medio')
        .in('cnpj', cnpjs)
      patterns = data || []
    }

    // Calculate discount distribution
    const descontos = (competitors || [])
      .filter(c => c.valor_proposta && c.valor_proposta > 0)
      .map(c => ((valorEstimado - c.valor_proposta) / valorEstimado * 100))
      .filter(d => d > -50 && d < 80)
      .sort((a, b) => a - b)

    // Calculate win probability based on position in distribution
    let probabilidadeVitoria = 0
    if (descontos.length > 0 && meuDesconto != null) {
      const melhorQueEu = descontos.filter(d => d > meuDesconto).length
      probabilidadeVitoria = Math.round((1 - melhorQueEu / descontos.length) * 100)
    }

    // Build histogram of discounts
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

    // Build competitor list with patterns
    const patternMap = new Map(patterns.map(p => [p.cnpj, p]))
    const concorrentes = (competitors || []).slice(0, 10).map(c => {
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

    // Recommendations
    const medianDesconto = descontos.length > 0 ? descontos[Math.floor(descontos.length / 2)] : 10
    const recomendacao = {
      lanceMinimo: Math.round(valorEstimado * (1 - (medianDesconto + 5) / 100)),
      lanceSugerido: Math.round(valorEstimado * (1 - medianDesconto / 100)),
      lanceAgressivo: Math.round(valorEstimado * (1 - (medianDesconto + 10) / 100)),
    }

    return NextResponse.json({
      probabilidadeVitoria,
      concorrentes,
      recomendacao,
      distribuicaoDescontos,
      descontoMediano: Math.round(medianDesconto * 100) / 100,
      totalConcorrentes: competitors?.length || 0,
    })
  } catch (err) {
    console.error('[lance-simulator]', err)
    return NextResponse.json({ error: 'Erro na simulação' }, { status: 500 })
  }
}
