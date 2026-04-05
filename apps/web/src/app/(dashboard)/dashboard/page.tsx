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
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4 text-white">Bem-vindo ao Licitagram!</h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-gray-400 mb-4">
              Para começar a receber oportunidades, cadastre os dados da sua empresa.
            </p>
            <Link
              href="/company"
              className="inline-flex items-center px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors duration-150"
            >
              Cadastrar Empresa
            </Link>
          </CardContent>
        </Card>
      </div>
    )
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
      .limit(1000),

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
      .limit(1000),

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

  const scoreDistribution = [
    { range: '90-100', count: scores.filter((s: number) => s >= 90).length, color: '#10B981' },
    { range: '70-89', count: scores.filter((s: number) => s >= 70 && s < 90).length, color: '#34D399' },
    { range: '50-69', count: scores.filter((s: number) => s >= 50 && s < 70).length, color: '#FBBF24' },
    ...(minScore < 50 ? [
      { range: `${minScore}-49`, count: scores.filter((s: number) => s >= minScore && s < 50).length, color: '#EF4444' },
    ] : []),
  ]

  // Match details for Valor, UFs, Modalidades
  const matchDetails = (matchesForStats.data || []) as Array<{ score: number; tenders: unknown }>
  let totalValueInAnalysis = 0
  const ufCounts: Record<string, number> = {}
  const modalidadeCounts: Record<string, number> = {}

  for (const m of matchDetails) {
    const t = m.tenders as Record<string, unknown> | null
    if (!t) continue
    if (t.valor_estimado) totalValueInAnalysis += Number(t.valor_estimado) || 0
    const uf = (t.uf as string) || 'N/I'
    const mod = (t.modalidade_nome as string) || 'N/I'
    ufCounts[uf] = (ufCounts[uf] || 0) + 1
    modalidadeCounts[mod] = (modalidadeCounts[mod] || 0) + 1
  }

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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">Visão geral das suas oportunidades</p>
        </div>
        <p className="text-[10px] text-gray-500 bg-white/[0.04] px-3 py-1.5 rounded-full border border-white/[0.06]">
          Atualizado: {new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {/* ─── KPI Row 1: Volume ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <KPICard label="Licitações Abertas" value={totalTenders.toLocaleString('pt-BR')} />
        <KPICard label="Novas Esta Semana" value={weekTenders.toLocaleString('pt-BR')} trend={weekTrend} />
        <KPICard label="Matches Este Mês" value={monthMatches.toLocaleString('pt-BR')} trend={matchesTrend} />
        <KPICard label="Valor em Análise" value={totalValueInAnalysis > 0 ? formatCompactValue(totalValueInAnalysis) : 'R$ 0'} subtitle="Soma dos editais monitorados" small />
      </div>

      {/* ─── KPI Row 2: Performance ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <KPICard
          label="Score Médio"
          value={`${avgScore}`}
          suffix="/100"
          highlight
        />
        <KPICard label="Score 70+" value={highMatches.toLocaleString('pt-BR')} />
        <KPICard
          label="Taxa de Interesse"
          value={`${conversionRate}%`}
          subtitle={conversionRate === 0 ? 'Aguardando primeiras interações' : undefined}
        />
        <KPICard label="Total de Matches" value={totalMatches.toLocaleString('pt-BR')} />
      </div>

      {/* ─── Monthly Report ─── */}
      <div className="mb-6">
        <MonthlyReportCard />
      </div>

      {/* ─── Segment Price Widget ─── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <SegmentPriceWidget />
      </div>

      {/* ─── Win Rate Card ─── */}
      {totalOutcomes > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="md:col-span-1">
            <CardContent className="pt-5 pb-4 px-5">
              <WinRateCircle rate={overallWinRate} won={totalWon} lost={totalLost} />
              {recentTotal >= 3 && Math.abs(winRateDiff) > 10 && (
                <p className={`text-xs mt-3 font-medium ${winRateDiff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {winRateDiff > 0 ? '↑' : '↓'} {Math.abs(winRateDiff)}% nos últimos 30 dias
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Section Divider ─── */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        <h2 className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Análise de Performance</h2>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold tracking-tight">Distribuição de Scores</CardTitle></CardHeader>
          <CardContent>
            <ScoreDonut distribution={scoreDistribution.map(d => ({ ...d, percentage: scores.length > 0 ? Math.round((d.count / scores.length) * 100) : 0 }))} />
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
            <div className="space-y-2">
              {topMatchesResult.data.map((match) => {
                const tender = (match.tenders as unknown) as Record<string, unknown> | null
                const scoreVal = match.score
                const scoreColor = scoreVal >= 80 ? '#10B981' : scoreVal >= 70 ? '#84CC16' : scoreVal >= 50 ? '#F59E0B' : '#EF4444'

                // Countdown
                const encDate = tender?.data_encerramento ? new Date(tender.data_encerramento as string) : null
                const diffDays = encDate ? Math.ceil((encDate.getTime() - now.getTime()) / 86400000) : null

                return (
                  <Link
                    key={match.id}
                    href={`/opportunities/${match.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.02] transition-all duration-200 group"
                  >
                    {/* Mini score ring */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2"
                      style={{ borderColor: scoreColor, backgroundColor: scoreColor + '10' }}
                    >
                      <span className="text-xs font-bold font-[family-name:var(--font-geist-mono)] tabular-nums" style={{ color: scoreColor }}>{scoreVal}</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white line-clamp-1 group-hover:text-brand transition-colors">{(tender?.objeto as string) || 'N/A'}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                        <span className="truncate max-w-[200px]">{(tender?.orgao_nome as string) || ''}</span>
                        {Boolean(tender?.uf) && <span>· {String(tender?.uf)}</span>}
                        {Boolean(tender?.valor_estimado) && (
                          <span className="text-gray-400 font-[family-name:var(--font-geist-mono)] tabular-nums">
                            · {formatCurrency(Number(tender?.valor_estimado))}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right side: countdown + status */}
                    <div className="flex items-center gap-2 shrink-0">
                      {diffDays !== null && diffDays >= 0 && diffDays <= 7 && (
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                          diffDays <= 1 ? 'bg-red-500/20 text-red-400' :
                          diffDays <= 3 ? 'bg-amber-500/20 text-amber-400' :
                          'bg-white/[0.04] text-gray-400'
                        }`}>
                          {diffDays === 0 ? 'Hoje' : `D-${diffDays}`}
                        </span>
                      )}
                      <Badge variant="outline" className="text-[10px]">{
                        match.status === 'new' ? 'Nova' :
                        match.status === 'notified' ? 'Notificada' :
                        match.status === 'interested' ? 'Interesse' :
                        match.status === 'applied' ? 'Aplicada' :
                        match.status === 'dismissed' ? 'Descartada' :
                        match.status === 'won' ? 'Ganha' :
                        match.status === 'lost' ? 'Perdida' :
                        match.status
                      }</Badge>
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
}: {
  label: string
  value: string
  suffix?: string
  subtitle?: string
  small?: boolean
  highlight?: boolean
  trend?: { pct: number; direction: 'up' | 'down' | 'neutral' }
}) {
  return (
    <Card className={`relative overflow-hidden ${highlight ? 'border-emerald-500/20' : ''}`}>
      {/* Gleam line — only on highlighted card */}
      {highlight && (
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
      )}
      <CardContent className="pt-4 pb-3.5 px-4">
        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">{label}</p>
        <div className="flex items-baseline gap-1">
          <p className={`font-bold text-white font-[family-name:var(--font-geist-mono)] tabular-nums ${small ? 'text-lg' : 'text-2xl'} tracking-tight`}>
            {value}
          </p>
          {suffix && <span className="text-sm text-gray-500 font-[family-name:var(--font-geist-mono)]">{suffix}</span>}
        </div>
        {/* Trend indicator */}
        {trend && trend.direction !== 'neutral' && trend.pct > 0 && (
          <div className={`flex items-center gap-1 mt-1.5 text-[10px] font-medium ${
            trend.direction === 'up' ? 'text-emerald-400' : 'text-red-400'
          }`}>
            <span>{trend.direction === 'up' ? '↑' : '↓'}</span>
            <span className="font-[family-name:var(--font-geist-mono)] tabular-nums">{trend.pct}%</span>
            <span className="text-gray-600">vs período anterior</span>
          </div>
        )}
        {/* Subtitle */}
        {subtitle && <p className="text-[10px] text-gray-600 mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}
