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
import { getTenderList } from '@/lib/cache'
import { getAuthAndProfile } from '@/lib/cache'

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string; uf?: string; q?: string
    modalidade?: string; data_de?: string; data_ate?: string
    fonte?: string; busca_edital?: string; ordem_valor?: string; ordem_data?: string
  }>
}) {
  const auth = await getAuthAndProfile()
  if (!auth) redirect('/login')

  const params = await searchParams

  const page = parseInt(params.page || '1')
  const pageSize = 20
  const ufFilter = params.uf || ''
  const searchQuery = params.q || ''
  const modalidadeFilter = params.modalidade || ''
  const dataDeFilter = params.data_de || ''
  const dataAteFilter = params.data_ate || ''
  const fonteFilter = params.fonte || ''
  const buscaEdital = params.busca_edital === '1'
  const ordemValorFilter = params.ordem_valor || ''
  const ordemDataFilter = params.ordem_data || ''

  const baseParams = new URLSearchParams()
  if (ufFilter) baseParams.set('uf', ufFilter)
  if (searchQuery) baseParams.set('q', searchQuery)
  if (modalidadeFilter) baseParams.set('modalidade', modalidadeFilter)
  if (dataDeFilter) baseParams.set('data_de', dataDeFilter)
  if (dataAteFilter) baseParams.set('data_ate', dataAteFilter)
  if (fonteFilter) baseParams.set('fonte', fonteFilter)
  if (buscaEdital) baseParams.set('busca_edital', '1')
  if (ordemValorFilter) baseParams.set('ordem_valor', ordemValorFilter)
  if (ordemDataFilter) baseParams.set('ordem_data', ordemDataFilter)

  const { tenders, count, totalPages } = await getTenderList({
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
    showClosed: true,
  })

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">Arquivo</h1>
        <span className="text-sm text-gray-400">Licitações encerradas</span>
      </div>

      <div className="mb-4">
        <Link
          href="/opportunities"
          className="text-sm text-brand hover:underline"
        >
          ← Voltar para Oportunidades
        </Link>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <form className="space-y-4">
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
                  <option value="bec_sp">BEC SP</option>
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
                  href="/archive"
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
          <CardTitle className="text-sm sm:text-base">
            {count ?? 0} licitações encerradas
            {searchQuery && (
              <span className="text-sm font-normal text-gray-400 ml-2">
                para &quot;{searchQuery}&quot;
              </span>
            )}
          </CardTitle>
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
                <TableHead className="w-28 hidden md:table-cell">Publicação</TableHead>
                <TableHead className="w-32 hidden md:table-cell">Encerramento</TableHead>
                <TableHead className="w-24 hidden lg:table-cell">Fonte</TableHead>
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
                      {tender.data_publicacao
                        ? formatDate(tender.data_publicacao)
                        : '-'}
                    </TableCell>
                    <TableCell className="text-sm hidden md:table-cell">
                      <span className="text-xs text-gray-600">
                        {tender.data_encerramento ? formatDate(tender.data_encerramento) : '-'}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <SourceBadge source={tender.source || 'pncp'} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-400 py-8">
                    Nenhuma licitação encerrada encontrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              {page > 1 && (
                <Link
                  href={`/archive?page=${page - 1}&${baseParams.toString()}`}
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
                  href={`/archive?page=${page + 1}&${baseParams.toString()}`}
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

function truncateText(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 3) + '...' : text
}
