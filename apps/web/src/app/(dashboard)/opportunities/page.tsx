import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { formatDate, PNCP_MODALITIES } from '@licitagram/shared'
import { formatCurrencyBR as formatCurrencyFull } from '@/lib/format'
import {
  getAuthAndProfile,
  getTenderList,
  getMatchList,
  getMatchCount,
  getTenderCount,
} from '@/lib/cache'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { PipelineTag } from '@/components/pipeline-tag'
import { ModalidadeBadge } from '@/components/modalidade-badge'
import { createClient } from '@/lib/supabase/server'
import type { PlanFeatures } from '@licitagram/shared'
import { formatCompactBRL } from '@/lib/geo/map-utils'

// Force dynamic rendering — opportunities must always show fresh data
export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALL_SCORE_OPTIONS = Array.from({ length: 13 }, (_, i) => 40 + i * 5)
const UF_LIST = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

// ─── Status translations ─────────────────────────────────────────────────────
const MATCH_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  new: { label: 'Nova', cls: 'bg-foreground/5 text-foreground border-border' },
  notified: { label: 'Notificada', cls: 'bg-primary/10 text-primary border-primary/20' },
  interested: { label: 'Interesse', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  participating: { label: 'Participando', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  won: { label: 'Ganha', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  lost: { label: 'Perdida', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  discarded: { label: 'Descartada', cls: 'bg-foreground/5 text-muted-foreground border-border' },
}

const TENDER_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  new: { label: 'Nova', cls: 'bg-foreground/5 text-foreground border-border' },
  analyzed: { label: 'Analisado', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  analyzing: { label: 'Analisando...', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  error: { label: 'Analisar com IA', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncateText(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 3) + '...' : text
}

function countdownText(dataEncerramento: string | null): { text: string; urgent: boolean } | null {
  if (!dataEncerramento) return null
  const now = new Date()
  const enc = new Date(dataEncerramento)
  const diffDays = Math.ceil((enc.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { text: 'Encerrado', urgent: true }
  if (diffDays === 0) return { text: 'Hoje', urgent: true }
  if (diffDays <= 3) return { text: `${diffDays}d`, urgent: true }
  if (diffDays <= 7) return { text: `${diffDays}d`, urgent: false }
  return null
}

// ─── Score badge with new palette ─────────────────────────────────────────────

function ScoreBadge({ score, matchSource }: { score: number; matchSource?: string }) {
  const cls =
    score >= 90 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    : score >= 80 ? 'bg-lime-500/10 text-lime-400 border-lime-500/20'
    : score >= 70 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    : 'bg-slate-500/10 text-slate-400 border-slate-500/20'

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border font-mono tabular-nums ${cls}`}>
      {score}
    </span>
  )
}

function SourceBadge({ source }: { source: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    pncp: { label: 'PNCP', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    comprasgov: { label: 'Compras.gov', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    bec_sp: { label: 'BEC SP', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    portal_mg: { label: 'MG', cls: 'bg-primary/10 text-primary border-primary/20' },
  }
  const { label, cls } = config[source] || { label: source, cls: 'bg-foreground/5 text-muted-foreground border-border' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${cls}`}>
      {label}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string; uf?: string; view?: string; q?: string; q_match?: string
    modalidade?: string; score_min?: string; data_de?: string; data_ate?: string
    fonte?: string; esfera?: string; busca_edital?: string; ordem_valor?: string; ordem_data?: string
  }>
}) {
  const params = await searchParams

  const [auth, user] = await Promise.all([
    getAuthAndProfile(),
    getUserWithPlan(),
  ])
  if (!auth) redirect('/login')

  const { companyId, minScore: userMinScore, minValor, maxValor } = auth
  const canExport = user ? hasFeature(user, 'export_excel') : false
  const allowedPortals: string[] = (user?.features as PlanFeatures | null)?.portais || []
  const hasAllPortals = user?.isPlatformAdmin || allowedPortals.length >= 5

  const page = parseInt(params.page || '1')
  const pageSize = 20
  const ufFilter = params.uf || ''
  const searchQuery = params.q || ''
  const view = params.view || 'matches'
  const modalidadeFilter = params.modalidade || ''
  const scoreMinFilter = parseInt(params.score_min || '') || 0
  const dataDeFilter = params.data_de || ''
  const dataAteFilter = params.data_ate || ''
  const fonteFilter = params.fonte || ''
  const esferaFilter = params.esfera || ''
  const buscaEdital = params.busca_edital === '1'
  const ordemValorFilter = params.ordem_valor || ''
  const ordemDataFilter = params.ordem_data || ''
  const qMatchFilter = params.q_match || ''

  // Build query params for pagination links
  const baseParams = new URLSearchParams()
  if (ufFilter) baseParams.set('uf', ufFilter)
  if (searchQuery) baseParams.set('q', searchQuery)
  if (modalidadeFilter) baseParams.set('modalidade', modalidadeFilter)
  if (scoreMinFilter) baseParams.set('score_min', String(scoreMinFilter))
  if (dataDeFilter) baseParams.set('data_de', dataDeFilter)
  if (dataAteFilter) baseParams.set('data_ate', dataAteFilter)
  if (fonteFilter) baseParams.set('fonte', fonteFilter)
  if (esferaFilter) baseParams.set('esfera', esferaFilter)
  if (buscaEdital) baseParams.set('busca_edital', '1')
  if (ordemValorFilter) baseParams.set('ordem_valor', ordemValorFilter)
  if (ordemDataFilter) baseParams.set('ordem_data', ordemDataFilter)
  if (qMatchFilter) baseParams.set('q_match', qMatchFilter)

  const hasActiveFilters = !!(qMatchFilter || searchQuery || modalidadeFilter || scoreMinFilter || dataDeFilter || dataAteFilter || fonteFilter || esferaFilter || ordemValorFilter || ordemDataFilter)

  if (view === 'matches' && companyId) {
    const [matchResult, tenderCount, matchTotalCount] = await Promise.all([
      getMatchList({
        companyId, page, pageSize, minScore: userMinScore,
        minValor: minValor ?? undefined, maxValor: maxValor ?? undefined,
        uf: ufFilter || undefined, modalidade: modalidadeFilter || undefined,
        dataFrom: dataDeFilter || undefined, dataTo: dataAteFilter || undefined,
        fonte: fonteFilter || undefined, esfera: esferaFilter || undefined,
        scoreMin: scoreMinFilter || undefined,
        ordemValor: ordemValorFilter || undefined, ordemData: ordemDataFilter || undefined,
        q: qMatchFilter || undefined,
      }),
      getTenderCount(),
      getMatchCount(companyId, userMinScore),
    ])

    const effectiveMinScore = scoreMinFilter > 0 ? scoreMinFilter : userMinScore

    return (
      <div>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-semibold text-foreground tracking-tight">Oportunidades</h1>
            <div className="flex gap-1 mt-3">
              <Link
                href="/opportunities?view=tenders"
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 border bg-transparent border-border text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              >
                Abertas
                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-mono tabular-nums">{tenderCount?.toLocaleString('pt-BR') ?? 0}</span>
              </Link>
              <Link
                href="/opportunities?view=matches"
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 border bg-secondary border-border text-foreground"
              >
                Matches IA
                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono tabular-nums">{matchTotalCount?.toLocaleString('pt-BR') ?? 0}</span>
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-mono tabular-nums">
              {matchResult.count?.toLocaleString('pt-BR') ?? 0} resultados
              <span className="text-muted-foreground/60"> · score &ge; {effectiveMinScore}%</span>
            </span>
            {canExport && (
              <a
                href={`/api/export?view=matches&uf=${ufFilter}&modalidade=${modalidadeFilter}&fonte=${fonteFilter}&score_min=${effectiveMinScore}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                Exportar Excel
              </a>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <form className="space-y-3">
            <input type="hidden" name="view" value="matches" />
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1 max-w-sm">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  name="q_match"
                  type="text"
                  defaultValue={qMatchFilter}
                  placeholder="Buscar por objeto, órgão..."
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-secondary/50 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              {/* Quick filters */}
              <div className="flex flex-wrap gap-2 items-center">
                <select name="score_min" defaultValue={scoreMinFilter > 0 ? String(scoreMinFilter) : ''} className="opp-filter-select">
                  <option value="">Score: Config ({userMinScore}%)</option>
                  {ALL_SCORE_OPTIONS.map((s) => <option key={s} value={s}>{s}%</option>)}
                </select>
                <select name="uf" defaultValue={ufFilter} className="opp-filter-select">
                  <option value="">UF: Todas</option>
                  {UF_LIST.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </select>
                <select name="fonte" defaultValue={fonteFilter} className="opp-filter-select">
                  <option value="">Fonte: Todas</option>
                  <option value="pncp">PNCP</option>
                  <option value="comprasgov">Compras.gov</option>
                  {hasAllPortals && <option value="bec_sp">BEC SP</option>}
                  {hasAllPortals && <option value="compras_mg">Compras MG</option>}
                </select>
                <select name="esfera" defaultValue={esferaFilter} className="opp-filter-select">
                  <option value="">Esfera: Todas</option>
                  <option value="F">Federal</option>
                  <option value="E">Estadual</option>
                  <option value="M">Municipal</option>
                </select>
                <select name="ordem_valor" defaultValue={ordemValorFilter} className="opp-filter-select">
                  <option value="">Valor: Padrão</option>
                  <option value="valor_desc">Valor: Maior</option>
                  <option value="valor_asc">Valor: Menor</option>
                </select>
                <select name="ordem_data" defaultValue={ordemDataFilter} className="opp-filter-select">
                  <option value="">Data: Padrão</option>
                  <option value="data_desc">Data: Recente</option>
                  <option value="data_asc">Data: Antiga</option>
                </select>
              </div>
            </div>
            {/* Submit + clear */}
            <div className="flex items-center gap-2">
              <button type="submit" className="h-8 px-4 text-xs font-medium rounded-lg bg-foreground/10 text-foreground border border-border hover:bg-foreground/15 transition-colors">
                Aplicar filtros
              </button>
              {hasActiveFilters && (
                <Link href="/opportunities?view=matches" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Limpar
                </Link>
              )}
            </div>
          </form>
        </div>

        {/* Table */}
        {(matchResult.count ?? 0) === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <p className="text-muted-foreground text-sm mb-1">A análise por IA está processando suas licitações.</p>
            <p className="text-muted-foreground/60 text-xs">Os matches aparecerão aqui conforme as licitações forem analisadas.</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="opp-table">
                <thead>
                  <tr>
                    <th style={{ width: 52 }}>Score</th>
                    <th style={{ minWidth: 280 }}>Oportunidade</th>
                    <th style={{ width: 120 }} className="text-right">Valor</th>
                    <th style={{ width: 140 }}>Prazo</th>
                    <th style={{ width: 90 }}>Fonte</th>
                    <th style={{ width: 100 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {matchResult.matches?.map((match: any) => {
                    const tender = (match.tenders as unknown) as Record<string, unknown> | null
                    const cd = countdownText(tender?.data_encerramento as string | null)
                    const statusInfo = MATCH_STATUS_MAP[match.status] || { label: match.status, cls: 'bg-foreground/5 text-muted-foreground border-border' }

                    return (
                      <tr key={match.id} className="opp-row">
                        <td className="opp-col-score">
                          <Link href={`/opportunities/${match.id}`}>
                            <ScoreBadge score={match.score} matchSource={match.match_source} />
                          </Link>
                        </td>
                        <td className="opp-col-main">
                          <Link href={`/opportunities/${match.id}`} className="block group">
                            <p className="opp-title group-hover:text-primary transition-colors">
                              {(tender?.objeto as string) || 'N/A'}
                            </p>
                            <div className="opp-meta">
                              <span>{truncateText((tender?.orgao_nome as string) || '', 40)}</span>
                              <span className="opp-dot">·</span>
                              <span>{(tender?.uf as string) || '-'}</span>
                            </div>
                            {!!(tender?.modalidade_nome || tender?.modalidade_id) && (
                              <div className="mt-0.5">
                                <ModalidadeBadge modalidadeId={tender?.modalidade_id as number} modalidadeNome={tender?.modalidade_nome as string} compact />
                              </div>
                            )}
                          </Link>
                        </td>
                        <td className="opp-col-value">
                          {tender?.valor_estimado ? (
                            <span className="font-mono tabular-nums text-[13px] font-semibold text-foreground" title={formatCurrencyFull(tender.valor_estimado as number)}>
                              {formatCompactBRL(tender.valor_estimado as number)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">-</span>
                          )}
                        </td>
                        <td className="opp-col-deadline">
                          {tender?.data_encerramento ? (
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[13px] font-medium text-foreground font-mono tabular-nums">
                                  {formatDate(tender.data_encerramento as string)}
                                </span>
                                {cd && (
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cd.urgent ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                    {cd.text}
                                  </span>
                                )}
                              </div>
                              {!!(tender?.data_abertura) && (
                                <span className="text-[11px] text-muted-foreground/60">
                                  Aberto em {formatDate(tender.data_abertura as string)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              Verificar prazo
                            </span>
                          )}
                        </td>
                        <td className="opp-col-source">
                          <SourceBadge source={(tender?.source as string) || 'pncp'} />
                        </td>
                        <td className="opp-col-status">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${statusInfo.cls}`}>
                            {statusInfo.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {matchResult.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-xs text-muted-foreground font-mono tabular-nums">
                  Página {page} de {matchResult.totalPages}
                </span>
                <div className="flex gap-1">
                  {page > 1 && (
                    <Link
                      href={`/opportunities?page=${page - 1}&view=matches&${baseParams.toString()}`}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                    >
                      Anterior
                    </Link>
                  )}
                  {page < matchResult.totalPages && (
                    <Link
                      href={`/opportunities?page=${page + 1}&view=matches&${baseParams.toString()}`}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                    >
                      Próxima
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ─── Tenders (Abertas) view ─────────────────────────────────────────────────

  const [tenderResult, matchCount, tenderTotalCount] = await Promise.all([
    getTenderList({
      page, pageSize,
      uf: ufFilter || undefined, modalidade: modalidadeFilter || undefined,
      dataFrom: dataDeFilter || undefined, dataTo: dataAteFilter || undefined,
      fonte: fonteFilter || undefined, esfera: esferaFilter || undefined,
      search: searchQuery || undefined, searchEdital: buscaEdital,
      ordemValor: ordemValorFilter || undefined, ordemData: ordemDataFilter || undefined,
    }),
    companyId ? getMatchCount(companyId, userMinScore) : Promise.resolve(0),
    getTenderCount(),
  ])

  const { tenders, count, totalPages } = tenderResult

  // Fetch existing pipeline matches for tenders
  let matchMap = new Map<string, { id: string; status: string }>()
  if (companyId && tenders && tenders.length > 0) {
    const supabase = await createClient()
    const tenderIds = tenders.map((t: any) => t.id)
    const { data: existingMatches } = await supabase
      .from('matches')
      .select('id, tender_id, status')
      .eq('company_id', companyId)
      .in('tender_id', tenderIds)
    matchMap = new Map(existingMatches?.map((m: any) => [m.tender_id, { id: m.id, status: m.status }]) || [])
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Oportunidades</h1>
          <div className="flex gap-1 mt-3">
            <Link
              href="/opportunities?view=tenders"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 border bg-secondary border-border text-foreground"
            >
              Abertas
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono tabular-nums">{tenderTotalCount?.toLocaleString('pt-BR') ?? 0}</span>
            </Link>
            <Link
              href="/opportunities?view=matches"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 border bg-transparent border-border text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            >
              Matches IA
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-mono tabular-nums">{matchCount?.toLocaleString('pt-BR') ?? 0}</span>
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-mono tabular-nums">
            {count?.toLocaleString('pt-BR') ?? 0} licitações
          </span>
          {canExport && (
            <a
              href={`/api/export?view=tenders&uf=${ufFilter}&modalidade=${modalidadeFilter}&fonte=${fonteFilter}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              Exportar Excel
            </a>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 mb-4">
        <form className="space-y-3">
          <input type="hidden" name="view" value={view} />
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                name="q"
                type="text"
                defaultValue={searchQuery}
                placeholder="Buscar por objeto, órgão..."
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-secondary/50 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <select name="uf" defaultValue={ufFilter} className="opp-filter-select">
                <option value="">UF: Todas</option>
                {UF_LIST.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
              <select name="modalidade" defaultValue={modalidadeFilter} className="opp-filter-select">
                <option value="">Modalidade: Todas</option>
                {Object.entries(PNCP_MODALITIES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              <select name="fonte" defaultValue={fonteFilter} className="opp-filter-select">
                <option value="">Fonte: Todas</option>
                <option value="pncp">PNCP</option>
                <option value="comprasgov">Compras.gov</option>
                {hasAllPortals && <option value="bec_sp">BEC SP</option>}
                {hasAllPortals && <option value="compras_mg">Compras MG</option>}
              </select>
              <select name="esfera" defaultValue={esferaFilter} className="opp-filter-select">
                <option value="">Esfera: Todas</option>
                <option value="F">Federal</option>
                <option value="E">Estadual</option>
                <option value="M">Municipal</option>
              </select>
              <select name="ordem_valor" defaultValue={ordemValorFilter} className="opp-filter-select">
                <option value="">Valor: Padrão</option>
                <option value="valor_desc">Valor: Maior</option>
                <option value="valor_asc">Valor: Menor</option>
              </select>
              <select name="ordem_data" defaultValue={ordemDataFilter} className="opp-filter-select">
                <option value="">Data: Padrão</option>
                <option value="data_desc">Data: Recente</option>
                <option value="data_asc">Data: Antiga</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className="h-8 px-4 text-xs font-medium rounded-lg bg-foreground/10 text-foreground border border-border hover:bg-foreground/15 transition-colors">
              Aplicar filtros
            </button>
            {hasActiveFilters && (
              <Link href={`/opportunities?view=${view}`} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Limpar
              </Link>
            )}
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="opp-table">
            <thead>
              <tr>
                <th style={{ minWidth: 280 }}>Oportunidade</th>
                <th style={{ width: 120 }} className="text-right">Valor</th>
                <th style={{ width: 140 }}>Prazo</th>
                <th style={{ width: 90 }}>Fonte</th>
                <th style={{ width: 100 }}>Status</th>
                {companyId && <th style={{ width: 80 }}>Pipeline</th>}
              </tr>
            </thead>
            <tbody>
              {tenders && tenders.length > 0 ? (
                tenders.map((tender: any) => {
                  const cd = countdownText(tender.data_encerramento)
                  const statusInfo = TENDER_STATUS_MAP[tender.status] || { label: tender.status, cls: 'bg-foreground/5 text-muted-foreground border-border' }

                  return (
                    <tr key={tender.id} className="opp-row">
                      <td className="opp-col-main">
                        <Link href={`/opportunities/tender/${tender.id}`} className="block group">
                          <p className="opp-title group-hover:text-primary transition-colors">
                            {tender.objeto || 'N/A'}
                          </p>
                          <div className="opp-meta">
                            <span>{truncateText(tender.orgao_nome || '', 40)}</span>
                            <span className="opp-dot">·</span>
                            <span>{tender.uf || '-'}</span>
                          </div>
                          {!!(tender.modalidade_nome || tender.modalidade_id) && (
                            <div className="mt-0.5">
                              <ModalidadeBadge modalidadeId={tender.modalidade_id} modalidadeNome={tender.modalidade_nome} compact />
                            </div>
                          )}
                        </Link>
                      </td>
                      <td className="opp-col-value">
                        {tender.valor_estimado ? (
                          <span className="font-mono tabular-nums text-[13px] font-semibold text-foreground" title={formatCurrencyFull(tender.valor_estimado)}>
                            {formatCompactBRL(tender.valor_estimado)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">-</span>
                        )}
                      </td>
                      <td className="opp-col-deadline">
                        {tender.data_encerramento ? (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[13px] font-medium text-foreground font-mono tabular-nums">
                                {formatDate(tender.data_encerramento)}
                              </span>
                              {cd && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cd.urgent ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                  {cd.text}
                                </span>
                              )}
                            </div>
                            {tender.data_abertura && (
                              <span className="text-[11px] text-muted-foreground/60">
                                Aberto em {formatDate(tender.data_abertura)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Verificar prazo
                          </span>
                        )}
                      </td>
                      <td className="opp-col-source">
                        <SourceBadge source={tender.source || 'pncp'} />
                      </td>
                      <td className="opp-col-status">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${statusInfo.cls}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      {companyId && (
                        <td className="align-middle">
                          <PipelineTag
                            tenderId={tender.id}
                            companyId={companyId}
                            matchId={matchMap.get(tender.id)?.id}
                            currentStatus={matchMap.get(tender.id)?.status}
                          />
                        </td>
                      )}
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={companyId ? 6 : 5} className="text-center text-muted-foreground py-12 text-sm">
                    Nenhuma licitação encontrada
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground font-mono tabular-nums">
              Página {page} de {totalPages}
            </span>
            <div className="flex gap-1">
              {page > 1 && (
                <Link
                  href={`/opportunities?page=${page - 1}&view=${view}&${baseParams.toString()}`}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                >
                  Anterior
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/opportunities?page=${page + 1}&view=${view}&${baseParams.toString()}`}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                >
                  Próxima
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
