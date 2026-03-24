import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { formatCurrency } from '@licitagram/shared'
import { AI_VERIFIED_SOURCES, MIN_DISPLAY_SCORE } from '@/lib/cache'

// Force dynamic rendering — dashboard must always show fresh data
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('company_id, min_score')
    .eq('id', user.id)
    .single()

  const companyId = profile?.company_id
  const minScore = Math.max(MIN_DISPLAY_SCORE, profile?.min_score ?? 10)

  if (!companyId) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4 text-gray-900">Bem-vindo ao Licitagram!</h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-gray-500 mb-4">
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
  const today = now.toISOString().split('T')[0] // YYYY-MM-DD
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

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
  ] = await Promise.all([
    // Total matches (AI-verified only, open tenders only)
    // IMPORTANT: use head:true to get accurate count without row limit (max_rows=1000)
    supabase
      .from('matches')
      .select('id, tenders!inner(data_encerramento, modalidade_id)', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('match_source', [...AI_VERIFIED_SOURCES])
      .gte('score', minScore)
      .not('tenders.modalidade_id', 'in', '(9,12,14)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' }),

    // Score 70+ matches (AI-verified only, open tenders only)
    supabase
      .from('matches')
      .select('id, tenders!inner(data_encerramento, modalidade_id)', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('match_source', [...AI_VERIFIED_SOURCES])
      .gte('score', 70)
      .not('tenders.modalidade_id', 'in', '(9,12,14)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' }),

    // Novas esta semana — filter on data_publicacao (actual publication date), NOT created_at
    // Also only count OPEN tenders (not expired)
    supabase
      .from('tenders')
      .select('id', { count: 'exact', head: true })
      .gte('data_publicacao', sevenDaysAgo.toISOString().split('T')[0])
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`),

    // Licitações monitoradas — only OPEN tenders (not expired)
    supabase
      .from('tenders')
      .select('id', { count: 'exact', head: true })
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`),

    // All match scores for distribution + average (AI-verified, open tenders)
    // Use explicit .limit(10000) to override PostgREST max_rows=1000 default
    supabase
      .from('matches')
      .select('score, tenders!inner(data_encerramento, modalidade_id)')
      .eq('company_id', companyId)
      .in('match_source', [...AI_VERIFIED_SOURCES])
      .gte('score', minScore)
      .not('tenders.modalidade_id', 'in', '(9,12,14)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
      .limit(1000),

    // Top 5 matches for "Melhores Oportunidades" (AI-verified, open tenders)
    supabase
      .from('matches')
      .select('id, score, status, match_source, created_at, tenders!inner(objeto, orgao_nome, uf, valor_estimado, data_encerramento, modalidade_id)')
      .eq('company_id', companyId)
      .in('match_source', [...AI_VERIFIED_SOURCES])
      .gte('score', minScore)
      .not('tenders.modalidade_id', 'in', '(9,12,14)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
      .order('score', { ascending: false })
      .limit(5),

    // Matches this month (AI-verified only, open tenders, no non-competitive modalities)
    supabase
      .from('matches')
      .select('id, tenders!inner(data_encerramento, modalidade_id)', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('match_source', [...AI_VERIFIED_SOURCES])
      .gte('score', minScore)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .not('tenders.modalidade_id', 'in', '(9,12,14)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' }),

    // Interested/applied matches (AI-verified only, open tenders, no non-competitive)
    supabase
      .from('matches')
      .select('id, tenders!inner(data_encerramento, modalidade_id)', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('match_source', [...AI_VERIFIED_SOURCES])
      .in('status', ['interested', 'applied'])
      .not('tenders.modalidade_id', 'in', '(9,12,14)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' }),

    // Matches with tender details for Valor em Análise, Top UFs, Top Modalidades
    // Use explicit .limit(10000) to override PostgREST max_rows=1000 default
    supabase
      .from('matches')
      .select('score, tenders!inner(uf, modalidade_nome, modalidade_id, valor_estimado, data_encerramento)')
      .eq('company_id', companyId)
      .in('match_source', [...AI_VERIFIED_SOURCES])
      .gte('score', minScore)
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
      .not('tenders.modalidade_id', 'in', '(9,12,14)')
      .limit(1000),

    // Company documents for health check
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
  ])

  const totalMatches = totalMatchesResult.count ?? 0
  const highMatches = highMatchesResult.count ?? 0
  const weekTenders = weekTendersResult.count ?? 0
  const totalTenders = totalTendersResult.count ?? 0
  const monthMatches = monthMatchesResult.count ?? 0
  const interestedCount = interestedResult.count ?? 0

  // Score average and distribution
  const scores = (allMatchScores.data || []).map((m) => m.score)
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0

  const scoreDistribution = [
    { range: '90-100', count: scores.filter((s: number) => s >= 90).length, color: 'bg-emerald-500' },
    { range: '70-89', count: scores.filter((s: number) => s >= 70 && s < 90).length, color: 'bg-emerald-400' },
    { range: '50-69', count: scores.filter((s: number) => s >= 50 && s < 70).length, color: 'bg-amber-400' },
    ...(minScore < 50 ? [
      { range: `${minScore}-49`, count: scores.filter((s: number) => s >= minScore && s < 50).length, color: 'bg-red-400' },
    ] : []),
  ]
  const maxScoreCount = Math.max(...scoreDistribution.map((d) => d.count), 1)

  // Valor em Análise, Top UFs, Top Modalidades — from ALL matches (no limit)
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
  const docs = (documentsResult.data || []) as Array<{ id: string; validade: string | null }>
  const docsExpiring = docs.filter((d) => {
    if (!d.validade) return false
    const diff = Math.ceil((new Date(d.validade).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return diff >= 0 && diff <= 30
  }).length
  const docsExpired = docs.filter((d) => {
    if (!d.validade) return false
    return new Date(d.validade) < now
  }).length

  // Win rate calculations
  const winStatsAll = (winStatsOverall.data || []) as Array<{ outcome: string }>
  const totalWon = winStatsAll.filter((o) => o.outcome === 'won').length
  const totalLost = winStatsAll.filter((o) => o.outcome === 'lost').length
  const totalOutcomes = totalWon + totalLost
  const overallWinRate = totalOutcomes > 0 ? Math.round((totalWon / totalOutcomes) * 100) : 0

  const recentOutcomes = (winStatsRecent.data || []) as Array<{ outcome: string }>
  const recentWon = recentOutcomes.filter((o) => o.outcome === 'won').length
  const recentTotal = recentOutcomes.length
  const recentWinRate = recentTotal > 0 ? Math.round((recentWon / recentTotal) * 100) : 0
  const winRateDiff = recentWinRate - overallWinRate

  const conversionRate = totalMatches > 0 ? Math.round((interestedCount / totalMatches) * 100) : 0

  return (
    <div id="dashboard-overview">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-[10px] text-gray-400">
          Atualizado: {new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard label="Licitações Abertas" value={totalTenders.toLocaleString('pt-BR')} />
        <KPICard label="Matches Este Mês" value={monthMatches.toLocaleString('pt-BR')} />
        <KPICard label="Score 70+" value={highMatches.toLocaleString('pt-BR')} accent />
        <KPICard label="Novas Esta Semana" value={weekTenders.toLocaleString('pt-BR')} />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard label="Score Médio" value={`${avgScore}/100`} />
        <KPICard label="Taxa de Interesse" value={`${conversionRate}%`} />
        <KPICard label="Valor em Análise" value={totalValueInAnalysis > 0 ? formatCurrency(totalValueInAnalysis) : 'R$ 0'} small />
        <KPICard label="Total de Matches" value={totalMatches.toLocaleString('pt-BR')} />
      </div>

      {/* Win Rate Card */}
      {totalOutcomes > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="md:col-span-1">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs font-medium text-gray-400 mb-1">Taxa de Vitória</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold text-gray-900">{overallWinRate}%</p>
                {recentTotal >= 3 && Math.abs(winRateDiff) > 10 && (
                  <span className={`text-sm font-medium ${winRateDiff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {winRateDiff > 0 ? '\u2191' : '\u2193'} {Math.abs(winRateDiff)}% (30d)
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">{totalWon} ganhas / {totalLost} perdidas</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle className="text-base text-gray-900">Distribuição de Scores</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {scoreDistribution.map((d) => (
                <div key={d.range} className="flex items-center gap-3">
                  <span className="text-sm font-mono w-14 shrink-0 text-gray-500">{d.range}</span>
                  <div className="flex-1 bg-gray-150 rounded-full h-6 overflow-hidden">
                    <div className={`h-full ${d.color} rounded-full flex items-center justify-end px-2`} style={{ width: `${Math.max((d.count / maxScoreCount) * 100, 8)}%` }}>
                      <span className="text-xs text-white font-bold">{d.count}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base text-gray-900">Saúde dos Documentos</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center mb-4">
              <div>
                <p className="text-2xl font-bold text-emerald-600">{docs.length - docsExpiring - docsExpired}</p>
                <p className="text-xs text-gray-400">Válidos</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-500">{docsExpiring}</p>
                <p className="text-xs text-gray-400">Vencendo</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-500">{docsExpired}</p>
                <p className="text-xs text-gray-400">Vencidos</p>
              </div>
            </div>
            {(docsExpiring > 0 || docsExpired > 0) && <Link href="/documents" className="block text-center text-sm text-brand hover:underline">Ver documentos</Link>}
            {docs.length === 0 && <Link href="/documents" className="block text-center text-sm text-brand hover:underline">Cadastrar documentos</Link>}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle className="text-base text-gray-900">Top 5 UFs com Oportunidades</CardTitle></CardHeader>
          <CardContent>
            {topUFs.length > 0 ? (
              <div className="space-y-2">
                {topUFs.map(([uf, count], i) => (
                  <div key={uf} className="flex items-center justify-between p-2 rounded-lg bg-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-400 w-5">{i + 1}.</span>
                      <span className="text-sm font-medium text-gray-900">{uf}</span>
                    </div>
                    <Badge variant="secondary">{count} matches</Badge>
                  </div>
                ))}
              </div>
            ) : <p className="text-center text-sm text-gray-400 py-4">Sem dados ainda</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base text-gray-900">Top 5 Modalidades</CardTitle></CardHeader>
          <CardContent>
            {topModalidades.length > 0 ? (
              <div className="space-y-2">
                {topModalidades.map(([mod, count], i) => (
                  <div key={mod} className="flex items-center justify-between p-2 rounded-lg bg-gray-100">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-sm font-bold text-gray-400 w-5 shrink-0">{i + 1}.</span>
                      <span className="text-sm font-medium text-gray-900 truncate">{mod}</span>
                    </div>
                    <Badge variant="secondary" className="shrink-0 ml-2">{count}</Badge>
                  </div>
                ))}
              </div>
            ) : <p className="text-center text-sm text-gray-400 py-4">Sem dados ainda</p>}
          </CardContent>
        </Card>
      </div>

      {/* Top opportunities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="text-gray-900">Melhores Oportunidades</span>
            <Link href="/opportunities" className="text-sm text-brand hover:underline font-normal">Ver todas</Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topMatchesResult.data && topMatchesResult.data.length > 0 ? (
            <div className="space-y-3">
              {topMatchesResult.data.map((match) => {
                const tender = (match.tenders as unknown) as Record<string, unknown> | null
                return (
                  <Link key={match.id} href={`/opportunities/${match.id}`} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors duration-150">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{(tender?.objeto as string) || 'N/A'}</p>
                      <p className="text-xs text-gray-400">
                        {(tender?.orgao_nome as string) || ''} — {(tender?.uf as string) || ''}
                        {tender?.valor_estimado ? ` — ${formatCurrency(tender.valor_estimado as number)}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <ScoreBadge score={match.score} source={match.match_source as string | null} />
                      <Badge variant="outline" className="text-xs">{
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
            <div className="text-center py-6">
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

function KPICard({ label, value, small, accent }: { label: string; value: string; small?: boolean; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs font-medium text-gray-400 mb-1">{label}</p>
        <p className={`font-bold ${small ? 'text-lg' : 'text-2xl'} ${accent ? 'text-brand' : 'text-gray-900'}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function ScoreBadge({ score, source }: { score: number; source?: string | null }) {
  const color = score >= 80 ? 'bg-orange-100 text-orange-800' : score >= 70 ? 'bg-emerald-100 text-emerald-800' : score >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
  const isAI = source === 'ai' || source === 'ai_triage' || source === 'semantic'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${color}`} title={isAI ? 'Score verificado por IA' : 'Score do matching automatico'}>
      {score}
      {isAI && <span className="text-[9px] font-normal opacity-70">IA</span>}
    </span>
  )
}
