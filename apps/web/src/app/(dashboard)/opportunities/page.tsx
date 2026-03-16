import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate, PNCP_MODALITIES } from '@licitagram/shared'
// Types in @/types/database (TenderRow, MatchRow) — cache.ts returns Record<string, any>
import {
  getAuthAndProfile,
  getTenderList,
  getMatchList,
  getMatchCount,
  getTenderCount,
} from '@/lib/cache'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import type { PlanFeatures } from '@licitagram/shared'

const DEFAULT_MIN_SCORE = 10
const ALL_SCORE_OPTIONS = Array.from({ length: 19 }, (_, i) => 10 + i * 5)

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string; uf?: string; view?: string; q?: string
    modalidade?: string; score_min?: string; data_de?: string; data_ate?: string
    fonte?: string; busca_edital?: string; ordem_valor?: string; ordem_data?: string
  }>
}) {
  const params = await searchParams

  // Single auth + profile fetch (replaces 2 separate queries)
  const [auth, user] = await Promise.all([
    getAuthAndProfile(),
    getUserWithPlan(),
  ])
  if (!auth) redirect('/login')

  const { companyId, minScore: userMinScore } = auth
  const canExport = user ? hasFeature(user, 'export_excel') : false
  const allowedPortals: string[] = (user?.features as PlanFeatures | null)?.portais || []
  const hasAllPortals = user?.isPlatformAdmin || allowedPortals.length >= 5

  const page = parseInt(params.page || '1')
  const pageSize = 20
  const ufFilter = params.uf || ''
  const searchQuery = params.q || ''
  const view = params.view || 'tenders'
  const modalidadeFilter = params.modalidade || ''
  const scoreMinFilter = parseInt(params.score_min || '') || 0
  const dataDeFilter = params.data_de || ''
  const dataAteFilter = params.data_ate || ''
  const fonteFilter = params.fonte || ''
  const buscaEdital = params.busca_edital === '1'
  const ordemValorFilter = params.ordem_valor || ''
  const ordemDataFilter = params.ordem_data || ''

  // Build query params for links
  const baseParams = new URLSearchParams()
  if (ufFilter) baseParams.set('uf', ufFilter)
  if (searchQuery) baseParams.set('q', searchQuery)
  if (modalidadeFilter) baseParams.set('modalidade', modalidadeFilter)
  if (scoreMinFilter) baseParams.set('score_min', String(scoreMinFilter))
  if (dataDeFilter) baseParams.set('data_de', dataDeFilter)
  if (dataAteFilter) baseParams.set('data_ate', dataAteFilter)
  if (fonteFilter) baseParams.set('fonte', fonteFilter)
  if (buscaEdital) baseParams.set('busca_edital', '1')
  if (ordemValorFilter) baseParams.set('ordem_valor', ordemValorFilter)
  if (ordemDataFilter) baseParams.set('ordem_data', ordemDataFilter)

  if (view === 'matches' && companyId) {
    // PARALLEL: fetch matches + both tab totals simultaneously
    const [matchResult, tenderCount, matchTotalCount] = await Promise.all([
      getMatchList({
        companyId,
        page,
        pageSize,
        minScore: userMinScore,
        uf: ufFilter || undefined,
        modalidade: modalidadeFilter || undefined,
        dataFrom: dataDeFilter || undefined,
        dataTo: dataAteFilter || undefined,
        fonte: fonteFilter || undefined,
        scoreMin: scoreMinFilter || undefined,
        ordemValor: ordemValorFilter || undefined,
        ordemData: ordemDataFilter || undefined,
      }),
      getTenderCount(),
      getMatchCount(companyId, userMinScore),
    ])

    return renderMatchesView({
      matches: matchResult.matches,
      matchCount: matchTotalCount,
      filteredMatchCount: matchResult.count,
      totalPages: matchResult.totalPages,
      tenderCount,
      page,
      ufFilter,
      modalidadeFilter,
      scoreMinFilter,
      dataDeFilter,
      dataAteFilter,
      fonteFilter,
      ordemValorFilter,
      ordemDataFilter,
      userMinScore,
      baseParams,
      canExport,
      hasAllPortals,
    })
  }

  // PARALLEL: fetch tenders + both tab totals simultaneously
  const [tenderResult, matchCount, tenderTotalCount] = await Promise.all([
    getTenderList({
      page,
      pageSize,
      uf: ufFilter || undefined,
      modalidade: modalidadeFilter || undefined,
      dataFrom: dataDeFilter || undefined,
      dataTo: dataAteFilter || undefined,
      fonte: fonteFilter || undefined,
      search: searchQuery || undefined,
      searchEdital: buscaEdital,
      ordemValor: ordemValorFilter || undefined,
      ordemData: ordemDataFilter || undefined,
    }),
    companyId ? getMatchCount(companyId, userMinScore) : Promise.resolve(0),
    getTenderCount(),
  ])

  const { tenders, count, totalPages } = tenderResult

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Oportunidades</h1>

      {/* View tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto items-center">
        <Link
          href={`/opportunities?view=tenders`}
          className={`px-3 sm:px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${
            view === 'tenders'
              ? 'bg-brand text-white'
              : 'bg-gray-150 text-gray-900 hover:bg-gray-200'
          }`}
        >
          Abertas ({tenderTotalCount ?? 0})
        </Link>
        <Link
          href={`/opportunities?view=matches`}
          className={`px-3 sm:px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${
            view === 'matches'
              ? 'bg-brand text-white'
              : 'bg-gray-150 text-gray-900 hover:bg-gray-200'
          }`}
        >
          Matches IA ({matchCount})
        </Link>
        <Link
          href="/archive"
          className="ml-auto text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap"
        >
          Ver arquivo →
        </Link>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <form className="space-y-4">
            <input type="hidden" name="view" value={view} />
            <div>
              <label className="text-sm font-medium text-gray-900">Buscar</label>
              <input
                name="q"
                type="text"
                defaultValue={searchQuery}
                placeholder="Buscar por palavra-chave..."
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <label className="mt-1 flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  name="busca_edital"
                  value="1"
                  defaultChecked={buscaEdital}
                  className="rounded border-gray-200"
                />
                Buscar no texto do edital
              </label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-900">UF</label>
                <select
                  name="uf"
                  defaultValue={ufFilter}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Todas</option>
                  {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(
                    (uf) => (
                      <option key={uf} value={uf}>{uf}</option>
                    ),
                  )}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-900">Modalidade</label>
                <select
                  name="modalidade"
                  defaultValue={modalidadeFilter}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Todas</option>
                  {Object.entries(PNCP_MODALITIES).map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-900">Fonte</label>
                <select
                  name="fonte"
                  defaultValue={fonteFilter}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Todas</option>
                  <option value="pncp">PNCP</option>
                  <option value="comprasgov">Compras.gov</option>
                  {hasAllPortals && <option value="bec_sp">BEC SP</option>}
                  {hasAllPortals && <option value="compras_mg">Compras MG</option>}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-900">De</label>
                <input
                  name="data_de"
                  type="date"
                  defaultValue={dataDeFilter}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-900">Até</label>
                <input
                  name="data_ate"
                  type="date"
                  defaultValue={dataAteFilter}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-900">Valor</label>
                <select
                  name="ordem_valor"
                  defaultValue={ordemValorFilter}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Padrão</option>
                  <option value="valor_desc">Maior</option>
                  <option value="valor_asc">Menor</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="submit"
                className="h-10 px-4 bg-brand text-white rounded-md hover:bg-brand-dark text-sm"
              >
                Filtrar
              </button>
              {(searchQuery || modalidadeFilter || dataDeFilter || dataAteFilter || fonteFilter || ordemValorFilter || ordemDataFilter) && (
                <Link
                  href={`/opportunities?view=${view}&uf=${ufFilter}`}
                  className="h-10 px-3 flex items-center text-sm text-gray-400 hover:text-gray-900"
                >
                  Limpar filtros
                </Link>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-sm sm:text-base">
              {count ?? 0} licitações
              {searchQuery && (
                <span className="text-sm font-normal text-gray-400 ml-2">
                  para &quot;{searchQuery}&quot;
                </span>
              )}
            </CardTitle>
            {canExport && (
              <a
                href={`/api/export?view=tenders&uf=${ufFilter}&modalidade=${modalidadeFilter}&fonte=${fonteFilter}`}
                className="px-3 py-1.5 bg-brand text-white rounded-md hover:bg-brand-dark text-xs sm:text-sm inline-flex items-center gap-1 w-fit"
              >
                Exportar Excel
              </a>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[250px]">Objeto</TableHead>
                <TableHead className="min-w-[150px]">Órgão</TableHead>
                <TableHead className="w-14">UF</TableHead>
                <TableHead className="w-32 hidden lg:table-cell">Valor</TableHead>
                <TableHead className="w-28 hidden md:table-cell">Abertura</TableHead>
                <TableHead className="w-32 hidden md:table-cell">Encerramento</TableHead>
                <TableHead className="w-28 hidden lg:table-cell">Publicação</TableHead>
                <TableHead className="w-24 hidden lg:table-cell">Fonte</TableHead>
                <TableHead className="w-20">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenders && tenders.length > 0 ? (
                tenders.map((tender) => (
                  <TableRow key={tender.id} className="cursor-pointer hover:bg-gray-100">
                    <TableCell>
                      <Link
                        href={`/opportunities/tender/${tender.id}`}
                        className="text-sm font-medium hover:text-brand hover:underline"
                      >
                        {truncateText(tender.objeto || 'N/A', 100)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {truncateText(tender.orgao_nome || '', 35)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{tender.uf || '-'}</TableCell>
                    <TableCell className="text-sm hidden lg:table-cell">
                      {tender.valor_estimado
                        ? formatCurrency(tender.valor_estimado)
                        : '-'}
                    </TableCell>
                    <TableCell className="text-sm hidden md:table-cell">
                      {tender.data_abertura
                        ? formatDate(tender.data_abertura)
                        : '-'}
                    </TableCell>
                    <TableCell className="text-sm hidden md:table-cell">
                      <EncerramentoBadge dataEncerramento={tender.data_encerramento} />
                    </TableCell>
                    <TableCell className="text-sm hidden lg:table-cell text-gray-400">
                      {tender.data_publicacao
                        ? formatDate(tender.data_publicacao)
                        : '-'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <SourceBadge source={tender.source || 'pncp'} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={tender.status} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-gray-400 py-8">
                    Nenhuma licitação encontrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>

          {/* Págination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              {page > 1 && (
                <Link
                  href={`/opportunities?page=${page - 1}&view=${view}&${baseParams.toString()}`}
                  className="px-3 py-1 border rounded text-sm hover:bg-gray-100"
                >
                  Anterior
                </Link>
              )}
              <span className="px-3 py-1 text-sm text-gray-500">
                Página {page} de {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={`/opportunities?page=${page + 1}&view=${view}&${baseParams.toString()}`}
                  className="px-3 py-1 border rounded text-sm hover:bg-gray-100"
                >
                  Próxima
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Matches View ────────────────────────────────────────────────────────────

function renderMatchesView(props: {
  matches: Array<Record<string, any>>
  matchCount: number
  filteredMatchCount: number
  totalPages: number
  tenderCount: number
  page: number
  ufFilter: string
  modalidadeFilter: string
  scoreMinFilter: number
  dataDeFilter: string
  dataAteFilter: string
  fonteFilter: string
  ordemValorFilter: string
  ordemDataFilter: string
  userMinScore: number
  baseParams: URLSearchParams
  canExport: boolean
  hasAllPortals: boolean
}) {
  const {
    matches, matchCount, filteredMatchCount, totalPages, tenderCount, page,
    ufFilter, modalidadeFilter, scoreMinFilter, dataDeFilter, dataAteFilter, fonteFilter,
    ordemValorFilter, ordemDataFilter, userMinScore, baseParams, canExport, hasAllPortals,
  } = props

  const effectiveMinScore = scoreMinFilter > 0 ? scoreMinFilter : userMinScore

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Oportunidades</h1>

      <div className="flex gap-2 mb-4 overflow-x-auto items-center">
        <Link
          href={`/opportunities?view=tenders`}
          className="px-3 sm:px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap bg-gray-150 text-gray-900 hover:bg-gray-200"
        >
          Abertas ({tenderCount ?? 0})
        </Link>
        <Link
          href={`/opportunities?view=matches`}
          className="px-3 sm:px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap bg-brand text-white"
        >
          Matches IA ({matchCount ?? 0})
        </Link>
        <Link
          href="/archive"
          className="ml-auto text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap"
        >
          Ver arquivo →
        </Link>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <form className="space-y-4">
            <input type="hidden" name="view" value="matches" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-900">Score Min</label>
                <select
                  name="score_min"
                  defaultValue={scoreMinFilter > 0 ? String(scoreMinFilter) : ''}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Config ({userMinScore}%)</option>
                  {ALL_SCORE_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}%{s === userMinScore ? ' (config)' : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-900">UF</label>
                <select
                  name="uf"
                  defaultValue={ufFilter}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Todas</option>
                  {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(
                    (uf) => (
                      <option key={uf} value={uf}>{uf}</option>
                    ),
                  )}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-900">Modalidade</label>
                <select
                  name="modalidade"
                  defaultValue={modalidadeFilter}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Todas</option>
                  {Object.entries(PNCP_MODALITIES).map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-900">Fonte</label>
                <select
                  name="fonte"
                  defaultValue={fonteFilter}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Todas</option>
                  <option value="pncp">PNCP</option>
                  <option value="comprasgov">Compras.gov</option>
                  {hasAllPortals && <option value="bec_sp">BEC SP</option>}
                  {hasAllPortals && <option value="compras_mg">Compras MG</option>}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-900">De</label>
                <input
                  name="data_de"
                  type="date"
                  defaultValue={dataDeFilter}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-900">Até</label>
                <input
                  name="data_ate"
                  type="date"
                  defaultValue={dataAteFilter}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-900">Valor</label>
                <select
                  name="ordem_valor"
                  defaultValue={ordemValorFilter}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Padrão</option>
                  <option value="valor_desc">Maior</option>
                  <option value="valor_asc">Menor</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-900">Data</label>
                <select
                  name="ordem_data"
                  defaultValue={ordemDataFilter}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Padrão</option>
                  <option value="data_desc">Recente</option>
                  <option value="data_asc">Antiga</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="submit"
                className="h-10 px-4 bg-brand text-white rounded-md hover:bg-brand-dark text-sm"
              >
                Filtrar
              </button>
              {(modalidadeFilter || scoreMinFilter || dataDeFilter || dataAteFilter || fonteFilter || ordemValorFilter || ordemDataFilter) && (
                <Link
                  href="/opportunities?view=matches"
                  className="h-10 px-3 flex items-center text-sm text-gray-400 hover:text-gray-900"
                >
                  Limpar filtros
                </Link>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-sm sm:text-base">
              {filteredMatchCount ?? 0} matches
              <span className="text-sm font-normal text-gray-400 ml-2">
                (score &ge; {effectiveMinScore}%)
              </span>
            </CardTitle>
            {canExport && (
              <a
                href={`/api/export?view=matches&uf=${ufFilter}&modalidade=${modalidadeFilter}&fonte=${fonteFilter}&score_min=${effectiveMinScore}`}
                className="px-3 py-1.5 bg-brand text-white rounded-md hover:bg-brand-dark text-xs sm:text-sm inline-flex items-center gap-1 w-fit"
              >
                Exportar Excel
              </a>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {(filteredMatchCount ?? 0) === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="mb-2">A análise por IA está processando suas licitações.</p>
              <p className="text-sm">Os matches aparecerão aqui conforme as licitações forem analisadas.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Score</TableHead>
                  <TableHead className="min-w-[250px]">Objeto</TableHead>
                  <TableHead className="min-w-[140px] hidden lg:table-cell">Órgão</TableHead>
                  <TableHead className="w-14">UF</TableHead>
                  <TableHead className="w-32 hidden md:table-cell">Valor</TableHead>
                  <TableHead className="w-28 hidden lg:table-cell">Modalidade</TableHead>
                  <TableHead className="w-28 hidden md:table-cell">Abertura</TableHead>
                  <TableHead className="w-32 hidden md:table-cell">Encerramento</TableHead>
                  <TableHead className="w-14 hidden lg:table-cell">Docs</TableHead>
                  <TableHead className="w-24 hidden xl:table-cell">Fonte</TableHead>
                  <TableHead className="w-28 hidden xl:table-cell">Rec. IA</TableHead>
                  <TableHead className="w-20">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches?.map((match: any) => {
                  const tender = (match.tenders as unknown) as Record<string, unknown> | null
                  const tenderDocs = (tender?.tender_documents as unknown as Array<{ id: string }>) || []
                  const recomendacao = match.recomendacao as string | null
                  return (
                    <TableRow key={match.id} className="cursor-pointer hover:bg-gray-100">
                      <TableCell>
                        <Link href={`/opportunities/${match.id}`}>
                          <ScoreBadge score={match.score} matchSource={match.match_source} />
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/opportunities/${match.id}`}
                          className="hover:text-brand"
                        >
                          <p className="text-sm font-medium leading-snug">
                            {truncateText((tender?.objeto as string) || 'N/A', 100)}
                          </p>
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500 hidden lg:table-cell">
                        {truncateText((tender?.orgao_nome as string) || '', 35)}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{(tender?.uf as string) || '-'}</TableCell>
                      <TableCell className="text-sm hidden md:table-cell">
                        {tender?.valor_estimado
                          ? formatCurrency(tender.valor_estimado as number)
                          : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-gray-500 hidden lg:table-cell">
                        {truncateText((tender?.modalidade_nome as string) || '-', 25)}
                      </TableCell>
                      <TableCell className="text-sm hidden md:table-cell">
                        {tender?.data_abertura
                          ? formatDate(tender.data_abertura as string)
                          : '-'}
                      </TableCell>
                      <TableCell className="text-sm hidden md:table-cell">
                        <EncerramentoBadge dataEncerramento={tender?.data_encerramento as string | null} />
                      </TableCell>
                      <TableCell className="text-sm text-center hidden lg:table-cell">
                        {tenderDocs.length > 0 ? (
                          <Badge variant="outline" className="text-xs">{tenderDocs.length}</Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <SourceBadge source={(tender?.source as string) || 'pncp'} />
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        {recomendacao && (
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              recomendacao === 'participar'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : recomendacao === 'avaliar_melhor'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-red-50 text-red-700 border-red-200'
                            }`}
                          >
                            {recomendacao === 'participar' ? 'Participar' : recomendacao === 'avaliar_melhor' ? 'Avaliar' : 'Não Rec.'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {match.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              {page > 1 && (
                <Link
                  href={`/opportunities?page=${page - 1}&view=matches&${baseParams.toString()}`}
                  className="px-3 py-1 border rounded text-sm hover:bg-gray-100"
                >
                  Anterior
                </Link>
              )}
              <span className="px-3 py-1 text-sm text-gray-500">
                Página {page} de {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={`/opportunities?page=${page + 1}&view=matches&${baseParams.toString()}`}
                  className="px-3 py-1 border rounded text-sm hover:bg-gray-100"
                >
                  Próxima
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Shared Components ───────────────────────────────────────────────────────

function ScoreBadge({ score, matchSource }: { score: number; matchSource?: string }) {
  const isAi = matchSource === 'ai' || matchSource === 'ai_triage'
  const color =
    score >= 70
      ? 'bg-emerald-100 text-emerald-800'
      : score >= 50
        ? 'bg-amber-100 text-amber-800'
        : 'bg-red-100 text-red-800'

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${color}`}>
      {score}
      {isAi && <span className="text-[10px] font-normal opacity-70">IA</span>}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: 'bg-brand/10 text-brand',
    analyzed: 'bg-emerald-100 text-emerald-800',
    error: 'bg-red-100 text-red-800',
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-150 text-gray-900'}`}>
      {status}
    </span>
  )
}

function SourceBadge({ source }: { source: string }) {
  const config: Record<string, { label: string; color: string }> = {
    pncp: { label: 'PNCP', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    comprasgov: { label: 'Compras.gov', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    bec_sp: { label: 'BEC SP', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    portal_mg: { label: 'MG', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  }
  const { label, color } = config[source] || { label: source, color: 'bg-gray-100 text-gray-900 border-gray-200' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      {label}
    </span>
  )
}

function EncerramentoBadge({ dataEncerramento }: { dataEncerramento: string | null | undefined }) {
  if (!dataEncerramento) return <span className="text-gray-400">-</span>

  return (
    <span className="text-xs text-gray-600">
      {formatDate(dataEncerramento)}
    </span>
  )
}

function truncateText(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 3) + '...' : text
}
