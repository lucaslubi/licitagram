import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { createClient } from '@supabase/supabase-js'
import { Badge } from '@/components/ui/badge'

const PAGE_SIZE = 50

function formatCurrency(value: number | null): string {
  if (!value) return 'R$ 0'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return '0%'
  return `${(Number(value) * 100).toFixed(1)}%`
}

export default async function AdminProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    search?: string
    uf?: string
    porte?: string
    sort?: string
    order?: string
    min_participacoes?: string
  }>
}) {
  await requirePlatformAdmin()
  const params = await searchParams

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const page = Math.max(1, parseInt(params.page || '1'))
  const sortField = params.sort || 'total_participacoes'
  const sortOrder = params.order === 'asc' ? true : false
  const minParticipacoes = parseInt(params.min_participacoes || '0')

  // Build query
  let query = supabase
    .from('competitor_stats')
    .select('*', { count: 'exact' })

  // Filters
  if (params.search) {
    const s = params.search.replace(/[^a-zA-Z0-9\s]/g, '')
    query = query.or(`razao_social.ilike.%${s}%,cnpj.ilike.%${s}%`)
  }
  if (params.uf) {
    query = query.eq('uf', params.uf)
  }
  if (params.porte) {
    query = query.eq('porte', params.porte)
  }
  if (minParticipacoes > 0) {
    query = query.gte('total_participacoes', minParticipacoes)
  }

  // Sort and paginate
  query = query
    .order(sortField, { ascending: sortOrder })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  const { data: competitors, count, error } = await query

  // Get distinct UFs and portes for filters
  const { data: ufs } = await supabase
    .from('competitor_stats')
    .select('uf')
    .not('uf', 'is', null)
    .order('uf')
    .limit(100)

  const distinctUfs = [...new Set((ufs || []).map((r) => r.uf).filter(Boolean))].sort()

  const { data: portes } = await supabase
    .from('competitor_stats')
    .select('porte')
    .not('porte', 'is', null)
    .limit(100)

  const distinctPortes = [...new Set((portes || []).map((r) => r.porte).filter(Boolean))].sort()

  const totalPages = Math.ceil((count || 0) / PAGE_SIZE)

  // Build current search params for pagination links
  function buildUrl(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams()
    if (params.search) sp.set('search', params.search)
    if (params.uf) sp.set('uf', params.uf)
    if (params.porte) sp.set('porte', params.porte)
    if (params.sort) sp.set('sort', params.sort)
    if (params.order) sp.set('order', params.order)
    if (params.min_participacoes) sp.set('min_participacoes', params.min_participacoes)
    for (const [k, v] of Object.entries(overrides)) {
      if (v) sp.set(k, v)
      else sp.delete(k)
    }
    return `/admin/prospects?${sp.toString()}`
  }

  function sortUrl(field: string) {
    const newOrder = sortField === field && !sortOrder ? 'asc' : undefined
    return buildUrl({ sort: field, order: newOrder, page: '1' })
  }

  function sortIcon(field: string) {
    if (sortField !== field) return ''
    return sortOrder ? ' ↑' : ' ↓'
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Prospectos (Concorrentes)</h1>
          <p className="text-sm text-gray-400 mt-1">
            {count?.toLocaleString('pt-BR') || 0} empresas encontradas em licitações
          </p>
        </div>
        <a
          href={`/api/admin/prospects/export?${new URLSearchParams(Object.fromEntries(Object.entries({ search: params.search, uf: params.uf, porte: params.porte, sort: params.sort, order: params.order, min_participacoes: params.min_participacoes }).filter((e): e is [string, string] => !!e[1]))).toString()}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Exportar Excel
        </a>
      </div>

      {/* Filters */}
      <form className="mb-6 flex flex-col sm:flex-row gap-3 flex-wrap">
        <input
          name="search"
          defaultValue={params.search || ''}
          placeholder="Buscar por razao social ou CNPJ..."
          className="flex-1 min-w-[200px] px-3 py-2 border rounded-md text-sm"
        />
        <select name="uf" defaultValue={params.uf || ''} className="px-3 py-2 border rounded-md text-sm">
          <option value="">Todos UFs</option>
          {distinctUfs.map((uf) => (
            <option key={uf} value={uf}>{uf}</option>
          ))}
        </select>
        <select name="porte" defaultValue={params.porte || ''} className="px-3 py-2 border rounded-md text-sm">
          <option value="">Todos portes</option>
          {distinctPortes.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <input
          name="min_participacoes"
          type="number"
          min="0"
          defaultValue={params.min_participacoes || ''}
          placeholder="Min. participacoes"
          className="w-40 px-3 py-2 border rounded-md text-sm"
        />
        <button type="submit" className="px-4 py-2 bg-brand text-white rounded-md text-sm">
          Filtrar
        </button>
        {(params.search || params.uf || params.porte || params.min_participacoes) && (
          <a href="/admin/prospects" className="px-4 py-2 border rounded-md text-sm text-gray-400 hover:bg-[#2d2f33]">
            Limpar
          </a>
        )}
      </form>

      {error && (
        <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-400 mb-4">
          Erro: {error.message}
        </div>
      )}

      {/* Table */}
      <div className="bg-[#1a1c1f] rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#1a1c1f] border-b">
            <tr>
              <th className="text-left px-3 py-3 font-medium text-gray-400">
                <a href={sortUrl('razao_social')} className="hover:text-white">Razao Social{sortIcon('razao_social')}</a>
              </th>
              <th className="text-left px-3 py-3 font-medium text-gray-400 hidden sm:table-cell">CNPJ</th>
              <th className="text-left px-3 py-3 font-medium text-gray-400 hidden md:table-cell">Email</th>
              <th className="text-left px-3 py-3 font-medium text-gray-400 hidden md:table-cell">Telefone</th>
              <th className="text-left px-3 py-3 font-medium text-gray-400 hidden lg:table-cell">Porte</th>
              <th className="text-left px-3 py-3 font-medium text-gray-400 hidden lg:table-cell">UF</th>
              <th className="text-left px-3 py-3 font-medium text-gray-400 hidden xl:table-cell">CNAE</th>
              <th className="text-center px-3 py-3 font-medium text-gray-400">
                <a href={sortUrl('total_participacoes')} className="hover:text-white">Partic.{sortIcon('total_participacoes')}</a>
              </th>
              <th className="text-center px-3 py-3 font-medium text-gray-400">
                <a href={sortUrl('total_vitorias')} className="hover:text-white">Vitorias{sortIcon('total_vitorias')}</a>
              </th>
              <th className="text-center px-3 py-3 font-medium text-gray-400">
                <a href={sortUrl('win_rate')} className="hover:text-white">Win Rate{sortIcon('win_rate')}</a>
              </th>
              <th className="text-right px-3 py-3 font-medium text-gray-400 hidden md:table-cell">
                <a href={sortUrl('valor_total_ganho')} className="hover:text-white">Valor Ganho{sortIcon('valor_total_ganho')}</a>
              </th>
              <th className="text-center px-3 py-3 font-medium text-gray-400 hidden md:table-cell">
                <a href={sortUrl('desconto_medio')} className="hover:text-white">Desc. Medio{sortIcon('desconto_medio')}</a>
              </th>
              <th className="text-left px-3 py-3 font-medium text-gray-400 hidden xl:table-cell">UFs Atuacao</th>
              <th className="text-left px-3 py-3 font-medium text-gray-400 hidden xl:table-cell">Modalidades</th>
              <th className="text-left px-3 py-3 font-medium text-gray-400 hidden 2xl:table-cell">
                <a href={sortUrl('ultima_participacao')} className="hover:text-white">Ultima Partic.{sortIcon('ultima_participacao')}</a>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2d2f33]">
            {(competitors || []).map((c) => {
              const ufsAtuacao = (c.ufs_atuacao as Record<string, boolean>) || {}
              const modalidades = (c.modalidades as Record<string, boolean>) || {}
              const ufsKeys = Object.keys(ufsAtuacao).slice(0, 5)
              const modKeys = Object.keys(modalidades).slice(0, 3)

              return (
                <tr key={c.cnpj} className="hover:bg-[#2d2f33]">
                  <td className="px-3 py-2.5 font-medium text-white max-w-[200px] truncate" title={c.razao_social || ''}>
                    {c.razao_social || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-gray-400 font-mono text-xs hidden sm:table-cell">{c.cnpj}</td>
                  <td className="px-3 py-2.5 hidden md:table-cell max-w-[180px] truncate" title={c.email || ''}>
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="text-blue-400 hover:underline text-xs">{c.email}</a>
                    ) : (
                      <span className="text-gray-500 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-400 text-xs hidden md:table-cell">
                    {c.telefone || <span className="text-gray-500">—</span>}
                  </td>
                  <td className="px-3 py-2.5 hidden lg:table-cell">
                    {c.porte ? (
                      <Badge variant="outline" className="text-[10px]">{c.porte}</Badge>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-gray-400 hidden lg:table-cell">{c.uf || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-400 hidden xl:table-cell">{c.cnae_divisao || '—'}</td>
                  <td className="px-3 py-2.5 text-center font-semibold">{c.total_participacoes || 0}</td>
                  <td className="px-3 py-2.5 text-center text-emerald-400 font-semibold">{c.total_vitorias || 0}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`font-semibold ${
                      Number(c.win_rate) >= 0.5 ? 'text-emerald-400' : Number(c.win_rate) >= 0.2 ? 'text-amber-400' : 'text-gray-400'
                    }`}>
                      {formatPercent(c.win_rate)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-500 hidden md:table-cell">
                    {formatCurrency(c.valor_total_ganho)}
                  </td>
                  <td className="px-3 py-2.5 text-center text-gray-400 hidden md:table-cell">
                    {formatPercent(c.desconto_medio)}
                  </td>
                  <td className="px-3 py-2.5 hidden xl:table-cell">
                    <div className="flex flex-wrap gap-0.5">
                      {ufsKeys.map((uf) => (
                        <span key={uf} className="text-[10px] px-1 py-0.5 bg-blue-900/20 text-blue-400 rounded">{uf}</span>
                      ))}
                      {Object.keys(ufsAtuacao).length > 5 && (
                        <span className="text-[10px] text-gray-400">+{Object.keys(ufsAtuacao).length - 5}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 hidden xl:table-cell">
                    <div className="flex flex-wrap gap-0.5 max-w-[150px]">
                      {modKeys.map((m) => (
                        <span key={m} className="text-[10px] px-1 py-0.5 bg-purple-900/20 text-purple-400 rounded truncate max-w-[120px]">{m}</span>
                      ))}
                      {Object.keys(modalidades).length > 3 && (
                        <span className="text-[10px] text-gray-400">+{Object.keys(modalidades).length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-gray-400 text-xs hidden 2xl:table-cell">
                    {c.ultima_participacao
                      ? new Date(c.ultima_participacao).toLocaleDateString('pt-BR')
                      : '—'}
                  </td>
                </tr>
              )
            })}
            {(!competitors || competitors.length === 0) && (
              <tr>
                <td colSpan={15} className="px-4 py-8 text-center text-gray-400">
                  Nenhum concorrente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-400">
            Pagina {page} de {totalPages} ({count?.toLocaleString('pt-BR')} registros)
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={buildUrl({ page: String(page - 1) })}
                className="px-3 py-1.5 border rounded text-sm hover:bg-[#2d2f33]"
              >
                Anterior
              </a>
            )}
            {page < totalPages && (
              <a
                href={buildUrl({ page: String(page + 1) })}
                className="px-3 py-1.5 border rounded text-sm hover:bg-[#2d2f33]"
              >
                Proxima
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
