import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan } from '@/lib/auth-helpers'

/**
 * GET /api/reports/monthly?month=2026-04
 * Returns KPIs for the specified month (defaults to previous month).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!user.companyId) return NextResponse.json({ error: 'Empresa não vinculada' }, { status: 400 })

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}` // Previous month
    const month = searchParams.get('month') || defaultMonth
    const monthStart = `${month}-01`
    const nextMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 1)
    const monthEnd = nextMonth.toISOString().split('T')[0]

    const supabase = await createClient()
    const companyId = user.companyId

    // Parallel queries
    const [
      { count: matchesFound },
      { count: highScoreMatches },
      { count: inPipeline },
      { count: won },
      { count: lost },
      { data: topMatches },
    ] = await Promise.all([
      supabase.from('matches').select('id', { count: 'exact', head: true }).eq('company_id', companyId).gte('created_at', monthStart).lt('created_at', monthEnd),
      supabase.from('matches').select('id', { count: 'exact', head: true }).eq('company_id', companyId).gte('score', 70).gte('created_at', monthStart).lt('created_at', monthEnd),
      supabase.from('matches').select('id', { count: 'exact', head: true }).eq('company_id', companyId).in('status', ['interested', 'applied']),
      supabase.from('matches').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'won').gte('updated_at', monthStart).lt('updated_at', monthEnd),
      supabase.from('matches').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'lost').gte('updated_at', monthStart).lt('updated_at', monthEnd),
      supabase.from('matches').select('id, score, status, tenders(objeto, orgao_nome, valor_estimado, uf)').eq('company_id', companyId).gte('created_at', monthStart).lt('created_at', monthEnd).order('score', { ascending: false }).limit(5),
    ])

    const winRate = (won || 0) + (lost || 0) > 0 ? Math.round(((won || 0) / ((won || 0) + (lost || 0))) * 100) : 0
    const tempoEconomizado = Math.round(((matchesFound || 0) * 15 + (inPipeline || 0) * 120) / 60)

    return NextResponse.json({
      month,
      kpis: [
        { label: 'Oportunidades encontradas', value: matchesFound || 0, icon: '📋' },
        { label: 'Score alto (>70)', value: highScoreMatches || 0, icon: '🎯' },
        { label: 'No pipeline', value: inPipeline || 0, icon: '📊' },
        { label: 'Vitórias', value: won || 0, icon: '🏆' },
        { label: 'Taxa de vitória', value: `${winRate}%`, icon: '📈' },
        { label: 'Tempo economizado', value: `${tempoEconomizado}h`, icon: '⏱️' },
      ],
      topOpportunities: (topMatches || []).map((m: any) => ({
        id: m.id,
        score: m.score,
        status: m.status,
        objeto: (m.tenders as any)?.objeto?.substring(0, 100),
        orgao: (m.tenders as any)?.orgao_nome,
        valor: (m.tenders as any)?.valor_estimado,
        uf: (m.tenders as any)?.uf,
      })),
    })
  } catch (err) {
    console.error('[reports/monthly]', err)
    return NextResponse.json({ error: 'Erro ao gerar relatório' }, { status: 500 })
  }
}
