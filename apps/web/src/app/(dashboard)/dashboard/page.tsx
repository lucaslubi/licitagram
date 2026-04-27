import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { formatCurrency, formatDate } from '@licitagram/shared'
import { AI_VERIFIED_SOURCES, MIN_DISPLAY_SCORE, getAuthAndProfile } from '@/lib/cache'
import { ScoreDonut, UFBarChart, ModalidadeBarChart, DocumentHealth, WinRateCircle } from '@/components/dashboard/DashboardCharts'
import { SegmentPriceWidget } from '@/components/dashboard/SegmentPriceWidget'
import { MonthlyReportCard } from '@/components/monthly-report-card'

// Force dynamic rendering — dashboard must always show fresh data
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DashboardPage() {
  const auth = await getAuthAndProfile()
  if (!auth) redirect('/login')

  const supabase = await createClient()
  const companyId = auth.companyId
  const minScore = Math.max(MIN_DISPLAY_SCORE, auth.minScore)

  if (!companyId) {
    // First-time user without a company — send through the guided wizard
    redirect('/onboarding')
  }

  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Previous month for trends
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

  const [
    totalMatchesResult,
    highMatchesResult,
    weekTendersResult,
    totalTendersResult,
    allMatchScores,
    topMatchesResult,
    monthMatchesResult,
    interestedResult,
    matchesForStats,
    documentsResult,
    winStatsOverall,
    winStatsRecent,
    // Trend comparisons
    prevMonthMatchesResult,
    prevWeekTendersResult,
  ] = await Promise.all([
    // Total matches (AI-verified only, open tenders only)
    supabase
      .from('matches')
      .select('id, tenders!inner(data_encerramento, modalidade_id)', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('match_source', [...AI_VERIFIED_SOURCES])
      .gte('score', minScore)
      .not('tenders.modalidade_nome', 'in', '(Inexigibilidade,Credenciamento)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' }),

    // Score 70+ matches
    supabase
      .from('matches')
      .select('id, tenders!inner(data_encerramento, modalidade_id)', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('match_source', [...AI_VERIFIED_SOURCES])
      .gte('score', 70)
      .not('tenders.modalidade_nome', 'in', '(Inexigibilidade,Credenciamento)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' }),

    // New tenders this week
    supabase
      .from('tenders')
      .select('id', { count: 'exact', head: true })
      .gte('data_publicacao', sevenDaysAgo.toISOString().split('T')[0])
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`),

    // Total open tenders
    supabase
      .from('tenders')
      .select('id', { count: 'exact', head: true })
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`),

    // All match scores for distribution
    supabase
      .from('matches')
      .select('score, tenders!inner(data_encerramento, modalidade_id)')
      .eq('company_id', companyId)
      .in('match_source', [...AI_VERIFIED_SOURCES])
      .gte('score', minScore)
      .not('tenders.modalidade_nome', 'in', '(Inexigibilidade,Credenciamento)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
      .limit(100),

    // Top 5 matches
    supabase
      .from('matches')
      .select('id, score, status, match_source, created_at, tenders!inner(objeto, orgao_nome, uf, valor_estimado, data_encerramento, modalidade_id)')
      .eq('company_id', companyId)
      .in('match_source', [...AI_VERIFIED_SOURCES])
      .gte('score', minScore)
      .not('tenders.modalidade_nome', 'in', '(Inexigibilidade,Credenciamento)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
      .order('score', { ascending: false })
      .limit(5),

    // Matches this month
    supabase
      .from('matches')
      .select('id, tenders!inner(data_encerramento, modalidade_id)', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('match_source', [...AI_VERIFIED_SOURCES])
      .gte('score', minScore)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .not('tenders.modalidade_nome', 'in', '(Inexigibilidade,Credenciamento)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' }),

    // Interested/applied matches
    supabase
      .from('matches')
      .select('id, tenders!inner(data_encerramento, modalidade_id)', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('match_source', [...AI_VERIFIED_SOURCES])
      .in('status', ['interested', 'applied'])
      .not('tenders.modalidade_nome', 'in', '(Inexigibilidade,Credenciamento)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' }),

    // Matches with tender details for Valor, UFs, Modalidades
    supabase
      .from('matches')
      .select('score, tenders!inner(uf, modalidade_nome, modalidade_id, valor_estimado, data_encerramento)')
      .eq('company_id', companyId)
      .in('match_source', [...AI_VERIFIED_SOURCES])
      .gte('score', minScore)
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
      .not('tenders.modalidade_nome', 'in', '(Inexigibilidade,Credenciamento)')
      .limit(100),

    // Company documents
    supabase
      .from('company_documents')
      .select('id, validade')
      .eq('company_id', companyId),

    // Win stats overall
    supabase
      .from('bid_outcomes')
      .select('outcome', { count: 'exact' })
      .eq('company_id', companyId)
      .in('outcome', ['won', 'lost']),

    // Win stats last 30 days
    supabase
      .from('bid_outcomes')
      .select('outcome')
      .eq('company_id', companyId)
      .in('outcome', ['won', 'lost'])
      .gte('reported_at', thirtyDaysAgo.toISOString()),

    // ── Trend: Previous month matches ──
    supabase
      .from('matches')
      .select('id, tenders!inner(data_encerramento, modalidade_id)', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('match_source', [...AI_VERIFIED_SOURCES])
      .gte('score', minScore)
      .gte('created_at', sixtyDaysAgo.toISOString())
      .lt('created_at', thirtyDaysAgo.toISOString())
      .not('tenders.modalidade_nome', 'in', '(Inexigibilidade,Credenciamento)'),

    // ── Trend: Previous week tenders ──
    supabase
      .from('tenders')
      .select('id', { count: 'exact', head: true })
      .gte('data_publicacao', fourteenDaysAgo.toISOString().split('T')[0])
      .lt('data_publicacao', sevenDaysAgo.toISOString().split('T')[0]),
  ])

  const totalMatches = totalMatchesResult.count ?? 0
  const highMatches = highMatchesResult.count ?? 0
  const weekTenders = weekTendersResult.count ?? 0
  const totalTenders = totalTendersResult.count ?? 0
  const monthMatches = monthMatchesResult.count ?? 0
  const interestedCount = interestedResult.count ?? 0

  // Trend calculations
  const prevMonthMatches = prevMonthMatchesResult.count ?? 0
  const prevWeekTenders = prevWeekTendersResult.count ?? 0

  // Score average and distribution
  const scores = (allMatchScores.data || []).map((m) => m.score)
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0

  // Faixas alinhadas com a paleta recalibrada do mapa (sem cinza, gradiente IA).
  const scoreDistribution = [
    { range: 'Excelente (75+)',   count: scores.filter((s: number) => s >= 75).length,                        color: '#10B981' },
    { range: 'Muito bom (65-74)', count: scores.filter((s: number) => s >= 65 && s < 75).length,              color: '#22C55E' },
    { range: 'Bom (55-64)',       count: scores.filter((s: number) => s >= 55 && s < 65).length,              color: '#84CC16' },
    { range: 'Promissor (45-54)', count: scores.filter((s: number) => s >= 45 && s < 55).length,              color: '#F59E0B' },
    { range: 'Inicial (40-44)',   count: scores.filter((s: number) => s >= 40 && s < 45).length,              color: '#FBBF24' },
  ]

  // Match details for Valor, UFs, Modalidades
  const matchDetails = (matchesForStats.data || []) as Array<{ score: number; tenders: unknown }>
  let totalValueInAnalysis = 0
  const allValues: number[] = []
  const ufCounts: Record<string, number> = {}
  const modalidadeCounts: Record<string, number> = {}

  for (const m of matchDetails) {
    const t = m.tenders as Record<string, unknown> | null
    if (!t) continue
    const val = Number(t.valor_estimado) || 0
    if (val > 0) {
      totalValueInAnalysis += val
      allValues.push(val)
    }
    const uf = (t.uf as string) || 'N/I'
    const mod = (t.modalidade_nome as string) || 'N/I'
    ufCounts[uf] = (ufCounts[uf] || 0) + 1
    modalidadeCounts[mod] = (modalidadeCounts[mod] || 0) + 1
  }

  // Value range for Ticket Médio
  allValues.sort((a, b) => a - b)
  const minValue = allValues.length > 0 ? allValues[0] : 0
  const maxValue = allValues.length > 0 ? allValues[allValues.length - 1] : 0
  const avgValue = allValues.length > 0 ? totalValueInAnalysis / allValues.length : 0
  const avgPctInRange = maxValue > minValue ? ((avgValue - minValue) / (maxValue - minValue)) * 100 : 50

  const topUFs = Object.entries(ufCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const topModalidades = Object.entries(modalidadeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // Document health
  let docs: Array<{ id: string; validade: string | null }> = []
  let docsExpiring = 0
  let docsExpired = 0
  try {
    docs = (documentsResult.data || []) as Array<{ id: string; validade: string | null }>
    if (documentsResult.error) throw documentsResult.error
    docsExpiring = docs.filter((d) => {
      if (!d.validade) return false
      const diff = Math.ceil((new Date(d.validade).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return diff >= 0 && diff <= 30
    }).length
    docsExpired = docs.filter((d) => {
      if (!d.validade) return false
      return new Date(d.validade) < now
    }).length
  } catch { /* company_documents table may not exist */ }

  // Win rate calculations
  let totalWon = 0
  let totalLost = 0
  let totalOutcomes = 0
  let overallWinRate = 0
  let recentWon = 0
  let recentTotal = 0
  let recentWinRate = 0
  let winRateDiff = 0
  try {
    if (winStatsOverall.error) throw winStatsOverall.error
    const winStatsAll = (winStatsOverall.data || []) as Array<{ outcome: string }>
    totalWon = winStatsAll.filter((o) => o.outcome === 'won').length
    totalLost = winStatsAll.filter((o) => o.outcome === 'lost').length
    totalOutcomes = totalWon + totalLost
    overallWinRate = totalOutcomes > 0 ? Math.round((totalWon / totalOutcomes) * 100) : 0

    if (winStatsRecent.error) throw winStatsRecent.error
    const recentOutcomes = (winStatsRecent.data || []) as Array<{ outcome: string }>
    recentWon = recentOutcomes.filter((o) => o.outcome === 'won').length
    recentTotal = recentOutcomes.length
    recentWinRate = recentTotal > 0 ? Math.round((recentWon / recentTotal) * 100) : 0
    winRateDiff = recentWinRate - overallWinRate
  } catch { /* bid_outcomes table may not exist */ }

  const conversionRate = totalMatches > 0 ? Math.round((interestedCount / totalMatches) * 100) : 0

  // Format compact value
  function formatCompactValue(n: number): string {
    if (n >= 1_000_000_000) return `R$ ${(n / 1_000_000_000).toFixed(2)} bi`
    if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)} mi`
    if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)} mil`
    return formatCurrency(n)
  }

  // Trend calculation helper
  function calcTrend(current: number, previous: number): { pct: number; direction: 'up' | 'down' | 'neutral' } {
    if (previous === 0 && current === 0) return { pct: 0, direction: 'neutral' }
    if (previous === 0) return { pct: 100, direction: 'up' }
    const pct = Math.round(((current - previous) / previous) * 100)
    return { pct: Math.abs(pct), direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral' }
  }

  const matchesTrend = calcTrend(monthMatches, prevMonthMatches)
  const weekTrend = calcTrend(weekTenders, prevWeekTenders)

  return (
    <div className="-m-4 p-4 md:-m-8 md:p-8 pb-8 md:pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Command Center</h1>
          <p className="text-xs text-muted-foreground mt-1">Visão geral das suas oportunidades</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/opportunities"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:border-muted-foreground/30"
          >
            Ver oportunidades →
          </Link>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 rounded-lg border border-border">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
              {new Date().toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </div>

      {/* ─── KPI Row 1: Volume ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <KPICard label="Licitações Abertas" value={totalTenders.toLocaleString('pt-BR')} noTrend />
        <KPICard label="Novas Esta Semana" value={weekTenders.toLocaleString('pt-BR')} trend={weekTrend} />
        <KPICard label="Matches Este Mês" value={monthMatches.toLocaleString('pt-BR')} trend={matchesTrend} />
        <KPICard label="Valor em Análise" value={totalValueInAnalysis > 0 ? formatCompactValue(totalValueInAnalysis) : 'R$ 0'} subtitle="Soma dos editais monitorados" small noTrend />
      </div>

      {/* ─── KPI Row 2: Performance ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <KPICard
          label="Score Médio"
          value={`${avgScore}`}
          suffix="/100"
          highlight
          noTrend
        />
        <KPICard label="Score 70+" value={highMatches.toLocaleString('pt-BR')} noTrend />
        <KPICard
          label="Taxa de Interesse"
          value={`${conversionRate}%`}
          subtitle={conversionRate === 0 ? 'Aguardando primeiras interações' : undefined}
          noTrend
        />
        <KPICard label="Total de Matches" value={totalMatches.toLocaleString('pt-BR')} noTrend />
      </div>

      {/* ─── Monthly Report ─── */}
      <div className="mb-6">
        <MonthlyReportCard />
      </div>

      {/* ─── Segment Price Widget ─── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <SegmentPriceWidget />
      </div>

      {/* ─── Performance Cards ─── */}
      {totalOutcomes > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold tracking-tight">Taxa de Vitória</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <WinRateCircle rate={overallWinRate} won={totalWon} lost={totalLost} />
              {recentTotal >= 3 && Math.abs(winRateDiff) > 10 && (
                <p className={`text-xs font-medium ${winRateDiff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {winRateDiff > 0 ? '↑' : '↓'} {Math.abs(winRateDiff)}% nos últimos 30 dias
                </p>
              )}
              {/* CTA when losses exist */}
              {totalLost > 0 && (
                <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                  <p className="text-[11px] text-gray-500">Analise licitações perdidas para gaps competitivos</p>
                  <Link href="/opportunities?status=lost" className="text-[11px] text-gray-400 hover:text-white transition-colors whitespace-nowrap ml-2">
                    Ver análise →
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold tracking-tight">Ticket Médio</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-2xl font-bold text-white font-[family-name:var(--font-geist-mono)] tabular-nums">
                    {avgValue > 0 ? formatCompactValue(avgValue) : '—'}
                  </p>
                  <p className="text-[10px] text-gray-600 mt-1">— sem histórico</p>
                </div>

                {/* Range bar */}
                {allValues.length >= 3 && (
                  <div>
                    <div className="relative h-1.5 bg-white/[0.04] rounded-full">
                      <div className="absolute inset-y-0 left-0 bg-brand/30 rounded-full" style={{ width: `${Math.min(100, avgPctInRange)}%` }} />
                      {/* Avg marker */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-brand border-2 border-[#131316] shadow-[0_0_0_3px_hsl(18_95%_55%/0.2)]"
                        style={{ left: `${Math.min(96, Math.max(4, avgPctInRange))}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-2">
                      <div>
                        <p className="text-[9px] text-gray-600">Menor</p>
                        <p className="text-[10px] text-gray-400 font-[family-name:var(--font-geist-mono)] tabular-nums">{formatCompactValue(minValue)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-brand">Médio</p>
                        <p className="text-[10px] text-gray-300 font-[family-name:var(--font-geist-mono)] tabular-nums">{formatCompactValue(avgValue)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] text-gray-600">Maior</p>
                        <p className="text-[10px] text-gray-400 font-[family-name:var(--font-geist-mono)] tabular-nums">{formatCompactValue(maxValue)}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/[0.03] rounded-lg p-3">
                    <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Em pipeline</p>
                    <p className="text-lg font-bold text-white font-[family-name:var(--font-geist-mono)] tabular-nums mt-0.5">{interestedCount}</p>
                  </div>
                  <div className="bg-white/[0.03] rounded-lg p-3">
                    <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Conversão</p>
                    <p className="text-lg font-bold text-white font-[family-name:var(--font-geist-mono)] tabular-nums mt-0.5">{conversionRate}%</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Section Divider ─── */}
      <div className="flex items-center gap-6 mt-12 mb-7">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.10] to-transparent" />
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-[0.14em] whitespace-nowrap px-2">Análise de Performance</h2>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.10] to-transparent" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold tracking-tight">Distribuição de Scores</CardTitle>
              {highMatches > 0 && scores.length > 0 && (
                <span className="text-[10px] text-emerald-400 font-medium font-[family-name:var(--font-geist-mono)]">
                  {Math.round((highMatches / scores.length) * 100)}% score alto
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ScoreDonut distribution={scoreDistribution.map(d => ({ ...d, percentage: scores.length > 0 ? Math.round((d.count / scores.length) * 100) : 0 }))} />
            <div className="flex items-center justify-between pt-3 border-t border-white/[0.06] text-[10px] text-gray-500">
              <span>{scores.length.toLocaleString('pt-BR')} matches analisados</span>
              <span>Score médio: <span className="text-white font-semibold font-[family-name:var(--font-geist-mono)]">{avgScore}</span></span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold tracking-tight">Saúde dos Documentos</CardTitle>
              {docs.length === 0 && <Link href="/documents" className="text-xs text-gray-400 hover:text-white transition-colors">Cadastrar →</Link>}
            </div>
          </CardHeader>
          <CardContent>
            <DocumentHealth valid={docs.length - docsExpiring - docsExpired} expiring={docsExpiring} expired={docsExpired} />
            {(docsExpiring > 0 || docsExpired > 0) && (
              <Link href="/documents" className="flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-white transition-colors mt-4 group">
                Gerenciar documentos <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold tracking-tight">Top 5 UFs</CardTitle></CardHeader>
          <CardContent>
            {topUFs.length > 0 ? (
              <UFBarChart data={topUFs} />
            ) : <p className="text-center text-xs text-gray-500 py-4">Sem dados ainda</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold tracking-tight">Top 5 Modalidades</CardTitle></CardHeader>
          <CardContent>
            {topModalidades.length > 0 ? (
              <ModalidadeBarChart data={topModalidades} />
            ) : <p className="text-center text-xs text-gray-500 py-4">Sem dados ainda</p>}
          </CardContent>
        </Card>
      </div>

      {/* ─── Top Opportunities ─── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold tracking-tight">Melhores Oportunidades</CardTitle>
            <Link href="/opportunities" className="text-xs text-gray-400 hover:text-white transition-colors group flex items-center gap-1">
              Ver todas <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {topMatchesResult.data && topMatchesResult.data.length > 0 ? (
            <div className="divide-y divide-white/[0.06]">
              {topMatchesResult.data.map((match) => {
                const tender = (match.tenders as unknown) as Record<string, unknown> | null
                const scoreVal = match.score
                const scoreColor = scoreVal >= 80 ? '#10B981' : scoreVal >= 70 ? '#84CC16' : scoreVal >= 50 ? '#F59E0B' : '#EF4444'

                // Countdown
                const encDate = tender?.data_encerramento ? new Date(tender.data_encerramento as string) : null
                const diffDays = encDate ? Math.ceil((encDate.getTime() - now.getTime()) / 86400000) : null

                // Status badge config
                const statusConfig = getStatusConfig(match.status as string)

                return (
                  <Link
                    key={match.id}
                    href={`/opportunities/${match.id}`}
                    className="grid grid-cols-[40px_1fr_120px_50px_90px] md:grid-cols-[40px_1fr_140px_56px_100px] gap-3 items-center py-3 px-2 rounded-lg hover:bg-white/[0.02] transition-colors group -mx-2"
                  >
                    {/* Score */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2"
                      style={{ borderColor: scoreColor, backgroundColor: scoreColor + '10' }}
                    >
                      <span className="text-xs font-bold font-[family-name:var(--font-geist-mono)] tabular-nums" style={{ color: scoreColor }}>{scoreVal}</span>
                    </div>

                    {/* Title + Org */}
                    <div className="min-w-0">
                      <p className="text-sm text-white line-clamp-1 group-hover:text-brand transition-colors">{(tender?.objeto as string) || 'N/A'}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {(tender?.orgao_nome as string) || ''}{Boolean(tender?.uf) && ` · ${String(tender?.uf)}`}
                      </p>
                    </div>

                    {/* Value — fixed column */}
                    <div className="text-right">
                      {Boolean(tender?.valor_estimado) ? (
                        <span className="text-xs text-gray-300 font-[family-name:var(--font-geist-mono)] tabular-nums">
                          {formatCurrency(Number(tender?.valor_estimado))}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </div>

                    {/* Countdown — fixed column */}
                    <div className="text-center">
                      {diffDays !== null && diffDays >= 0 && diffDays <= 7 ? (
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                          diffDays <= 1 ? 'bg-red-500/20 text-red-400' :
                          diffDays <= 3 ? 'bg-amber-500/20 text-amber-400' :
                          'bg-white/[0.04] text-gray-400'
                        }`}>
                          {diffDays === 0 ? 'Hoje' : `D-${diffDays}`}
                        </span>
                      ) : null}
                    </div>

                    {/* Status badge — fixed column */}
                    <div className="text-right">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${statusConfig.classes}`}>
                        {statusConfig.label}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-gray-400 text-sm mb-3">A IA está processando suas licitações. Os matches aparecerão aqui.</p>
              <Link href="/opportunities" className="inline-flex items-center px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark text-sm transition-colors duration-150">
                Ver licitações
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  suffix,
  subtitle,
  small,
  highlight,
  trend,
  noTrend,
}: {
  label: string
  value: string
  suffix?: string
  subtitle?: string
  small?: boolean
  highlight?: boolean
  trend?: { pct: number; direction: 'up' | 'down' | 'neutral' }
  noTrend?: boolean
}) {
  return (
    <Card className={`relative overflow-hidden ${highlight ? 'border-emerald-500/20' : ''}`}>
      {/* Gleam line — only on highlighted card */}
      {highlight && (
        <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
      )}
      <CardContent className="pt-4 pb-3.5 px-4">
        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">{label}</p>
        <div className="flex items-baseline gap-0.5">
          <p className={`font-bold text-white font-[family-name:var(--font-geist-mono)] tabular-nums ${small ? 'text-lg' : 'text-[28px]'} tracking-tight leading-none`}>
            {value}
          </p>
          {suffix && <span className="text-base text-gray-400 font-medium font-[family-name:var(--font-geist-mono)]">{suffix}</span>}
        </div>
        {/* Trend indicator */}
        {trend && trend.direction !== 'neutral' && trend.pct > 0 ? (
          <div className={`flex items-center gap-1 mt-2 text-[10px] font-medium ${
            trend.direction === 'up' ? 'text-emerald-400' : 'text-red-400'
          }`}>
            <span>{trend.direction === 'up' ? '↑' : '↓'}</span>
            <span className="font-[family-name:var(--font-geist-mono)] tabular-nums">{trend.pct}%</span>
            <span className="text-gray-600">vs período anterior</span>
          </div>
        ) : !noTrend && !subtitle ? (
          <p className="text-[10px] text-gray-600 mt-2">— sem histórico</p>
        ) : null}
        {/* Subtitle */}
        {subtitle && <p className="text-[10px] text-gray-600 mt-1.5">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}

// ─── Status Badge Config ──────────────────────────────────────────────────────

function getStatusConfig(status: string): { label: string; classes: string } {
  switch (status) {
    case 'new':
      return { label: 'Nova', classes: 'bg-white/[0.04] text-gray-400 border-white/[0.06]' }
    case 'notified':
      return { label: 'Notificada', classes: 'bg-brand/10 text-brand border-brand/20' }
    case 'interested':
      return { label: 'Interesse', classes: 'bg-amber-500/10 text-amber-400 border-amber-500/20' }
    case 'applied':
      return { label: 'Participando', classes: 'bg-blue-500/10 text-blue-400 border-blue-500/20' }
    case 'won':
      return { label: 'Ganha', classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' }
    case 'lost':
      return { label: 'Perdida', classes: 'bg-red-500/10 text-red-400 border-red-500/20' }
    case 'dismissed':
      return { label: 'Descartada', classes: 'bg-white/[0.03] text-gray-500 border-white/[0.04]' }
    default:
      return { label: status, classes: 'bg-white/[0.04] text-gray-400 border-white/[0.06]' }
  }
}
