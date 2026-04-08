import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

const DATA_API_URL = process.env.DATA_API_URL || 'http://85.31.60.53:3999'
const PAGE_SIZE = 50

const ALL_UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']
const SEGMENTOS = [
  'Tecnologia da Informação','Saúde','Construção de Edifícios','Infraestrutura',
  'Serviços de Construção','Limpeza e Facilities','Comércio Atacadista','Comércio Varejista',
  'Alimentos','Alimentação e Refeições','Engenharia e Arquitetura','Farmacêutico',
  'Transporte Terrestre','Consultoria Empresarial','Segurança','Educação',
  'Serviços Administrativos','Equipamentos Médicos','Máquinas e Equipamentos',
  'Manutenção Industrial','Energia e Gás','Locação de Equipamentos',
]

function formatCurrency(value: number | null): string {
  if (!value) return 'R$ 0'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / (86400 * 1000))
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'ontem'
  if (diff < 7) return `há ${diff} dias`
  if (diff < 30) return `há ${Math.floor(diff / 7)} sem.`
  if (diff < 365) return `há ${Math.floor(diff / 30)} meses`
  return `há ${Math.floor(diff / 365)} anos`
}

function scoreBadge(score: number) {
  if (score >= 80) return <Badge className="bg-emerald-600 text-white">{score}</Badge>
  if (score >= 50) return <Badge className="bg-amber-500 text-white">{score}</Badge>
  if (score >= 20) return <Badge className="bg-orange-500 text-white">{score}</Badge>
  return <Badge className="bg-zinc-600 text-white">{score}</Badge>
}

function planoBadge(plano: string | null) {
  if (!plano) return null
  const colors: Record<string, string> = {
    ENTERPRISE: 'bg-violet-600 text-white',
    PROFISSIONAL: 'bg-blue-600 text-white',
    ESSENCIAL: 'bg-zinc-600 text-white',
  }
  return <Badge className={colors[plano] || 'bg-zinc-600 text-white'}>{plano}</Badge>
}

function prioridadeBadge(prio: string | null) {
  const colors: Record<string, string> = {
    HOT: 'bg-red-600 text-white',
    WARM: 'bg-amber-500 text-white',
    COLD: 'bg-sky-600 text-white',
    NAO_DISPARAR: 'bg-zinc-700 text-zinc-400',
  }
  return <Badge className={colors[prio || ''] || 'bg-zinc-700 text-zinc-400'}>{prio || '—'}</Badge>
}

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePlatformAdmin()
  const params = await searchParams

  const page = Math.max(1, parseInt(params.page || '1'))

  // Build query params for Data API
  const queryParams = new URLSearchParams()
  queryParams.set('page', String(page))
  queryParams.set('pageSize', String(PAGE_SIZE))
  if (params.search) queryParams.set('search', params.search)
  if (params.uf) queryParams.set('uf', params.uf)
  if (params.segmento) queryParams.set('segmento', params.segmento)
  if (params.scoreMin) queryParams.set('scoreMin', params.scoreMin)
  if (params.plano) queryParams.set('plano', params.plano)
  if (params.prioridade) queryParams.set('prioridade', params.prioridade)
  if (params.comEmail === 'true') queryParams.set('comEmail', 'true')
  if (params.comSite === 'true') queryParams.set('comSite', 'true')
  if (params.excluirContactados !== 'false') queryParams.set('excluirContactados', 'true')
  if (params.ticketMin) queryParams.set('ticketMin', params.ticketMin)
  if (params.diasMax) queryParams.set('diasMax', params.diasMax)
  if (params.perdeuPorPouco === 'true') queryParams.set('perdeuPorPouco', 'true')
  if (params.sort) queryParams.set('sort', params.sort)
  if (params.order) queryParams.set('order', params.order)

  let leads: any[] = []
  let total = 0
  let totalPages = 0
  let fetchError = false

  try {
    const res = await fetch(`${DATA_API_URL}/api/leads?${queryParams.toString()}`, {
      cache: 'no-store',
    })
    if (res.ok) {
      const json = await res.json()
      leads = json.data || []
      total = json.pagination?.total || 0
      totalPages = json.pagination?.totalPages || 0
    } else {
      fetchError = true
    }
  } catch {
    fetchError = true
  }

  // Helpers for URL building
  function buildUrl(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams()
    const allParams = { ...params, ...overrides }
    for (const [k, v] of Object.entries(allParams)) {
      if (v) sp.set(k, v)
    }
    return `/admin/leads?${sp.toString()}`
  }

  function sortUrl(field: string) {
    const currentSort = params.sort || 'score_fit_licitagram'
    const currentOrder = params.order || 'desc'
    const newOrder = currentSort === field && currentOrder === 'desc' ? 'asc' : 'desc'
    return buildUrl({ sort: field, order: newOrder, page: '1' })
  }

  function sortIcon(field: string) {
    const currentSort = params.sort || 'score_fit_licitagram'
    if (currentSort !== field) return ''
    return (params.order || 'desc') === 'asc' ? ' ↑' : ' ↓'
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Lead Engine — Fornecedores</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {total.toLocaleString('pt-BR')} leads encontrados
            {params.prioridade && ` • Filtro: ${params.prioridade}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/leads/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
          >
            📊 Dashboard
          </Link>
        </div>
      </div>

      {/* Filters */}
      <form className="mb-6 p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input
            name="search"
            defaultValue={params.search || ''}
            placeholder="Buscar razão social ou CNPJ..."
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-white placeholder-zinc-500"
          />
          <select name="uf" defaultValue={params.uf || ''} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-white">
            <option value="">Todos UFs</option>
            {ALL_UFS.map((uf) => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>
          <select name="segmento" defaultValue={params.segmento || ''} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-white">
            <option value="">Todos segmentos</option>
            {SEGMENTOS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select name="prioridade" defaultValue={params.prioridade || ''} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-white">
            <option value="">Todas prioridades</option>
            <option value="HOT">🔥 HOT (80-100)</option>
            <option value="WARM">🌡️ WARM (50-79)</option>
            <option value="COLD">❄️ COLD (20-49)</option>
          </select>
          <select name="plano" defaultValue={params.plano || ''} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-white">
            <option value="">Todos planos</option>
            <option value="ENTERPRISE">Enterprise</option>
            <option value="PROFISSIONAL">Profissional</option>
            <option value="ESSENCIAL">Essencial</option>
          </select>
          <input
            name="scoreMin"
            type="number"
            defaultValue={params.scoreMin || ''}
            placeholder="Score mínimo..."
            min="0"
            max="100"
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-white placeholder-zinc-500"
          />
          <input
            name="ticketMin"
            type="number"
            defaultValue={params.ticketMin || ''}
            placeholder="Ticket médio min (R$)..."
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-white placeholder-zinc-500"
          />
          <input
            name="diasMax"
            type="number"
            defaultValue={params.diasMax || ''}
            placeholder="Participou nos últimos X dias..."
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-white placeholder-zinc-500"
          />
        </div>
        <div className="flex flex-wrap gap-4 mt-3 items-center">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" name="comEmail" value="true" defaultChecked={params.comEmail === 'true'} className="rounded" />
            Somente com e-mail
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" name="comSite" value="true" defaultChecked={params.comSite === 'true'} className="rounded" />
            Somente com site
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" name="perdeuPorPouco" value="true" defaultChecked={params.perdeuPorPouco === 'true'} className="rounded" />
            Perdeu por pouco (dor)
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" name="excluirContactados" value="false" defaultChecked={params.excluirContactados === 'false'} className="rounded" />
            Incluir já contactados
          </label>
          <button type="submit" className="ml-auto px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 transition-colors">
            Filtrar
          </button>
          <Link href="/admin/leads" className="px-4 py-2 bg-zinc-700 text-white rounded-md text-sm font-medium hover:bg-zinc-600 transition-colors">
            Limpar
          </Link>
        </div>
      </form>

      {fetchError ? (
        <div className="p-8 text-center bg-red-900/20 rounded-xl border border-red-800">
          <p className="text-red-400">Erro ao conectar com o Data API (VPS2). Verifique se o serviço está rodando em 85.31.60.53:3999.</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="p-8 text-center bg-zinc-900/50 rounded-xl border border-zinc-800">
          <p className="text-zinc-400">Nenhum lead encontrado. Execute o worker de população primeiro.</p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80 text-zinc-400 text-xs uppercase">
                <tr>
                  <th className="px-3 py-3 text-left">
                    <a href={sortUrl('razao_social')}>Empresa{sortIcon('razao_social')}</a>
                  </th>
                  <th className="px-3 py-3 text-left">UF</th>
                  <th className="px-3 py-3 text-center">
                    <a href={sortUrl('score_fit_licitagram')}>Score{sortIcon('score_fit_licitagram')}</a>
                  </th>
                  <th className="px-3 py-3 text-center">Plano</th>
                  <th className="px-3 py-3 text-left">Segmento</th>
                  <th className="px-3 py-3 text-center">
                    <a href={sortUrl('total_licitacoes_participadas_12m')}>Lic. 12m{sortIcon('total_licitacoes_participadas_12m')}</a>
                  </th>
                  <th className="px-3 py-3 text-right">
                    <a href={sortUrl('ticket_medio_contratos')}>Ticket Médio{sortIcon('ticket_medio_contratos')}</a>
                  </th>
                  <th className="px-3 py-3 text-center">
                    <a href={sortUrl('licitacoes_perdidas_por_pouco')}>Perdas{sortIcon('licitacoes_perdidas_por_pouco')}</a>
                  </th>
                  <th className="px-3 py-3 text-center">
                    <a href={sortUrl('ultima_participacao_data')}>Última Part.{sortIcon('ultima_participacao_data')}</a>
                  </th>
                  <th className="px-3 py-3 text-center">Email</th>
                  <th className="px-3 py-3 text-center">Site</th>
                  <th className="px-3 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {leads.map((lead: any) => (
                  <tr key={lead.cnpj} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="px-3 py-3">
                      <Link href={`/admin/leads/${lead.cnpj}`} className="hover:underline text-emerald-400 font-medium">
                        {lead.razao_social || lead.cnpj}
                      </Link>
                      <div className="text-xs text-zinc-500 mt-0.5 font-mono">
                        {lead.cnpj?.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}
                      </div>
                      {lead.bloqueado_disparo && (
                        <Badge className="bg-red-900/40 text-red-400 text-[10px] mt-1">BLOQUEADO: {lead.motivo_bloqueio}</Badge>
                      )}
                      {lead.opt_out && (
                        <Badge className="bg-yellow-900/40 text-yellow-400 text-[10px] mt-1">OPT-OUT</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 text-zinc-300">
                      <div>{lead.uf || '—'}</div>
                      <div className="text-xs text-zinc-500">{lead.municipio || ''}</div>
                    </td>
                    <td className="px-3 py-3 text-center">{scoreBadge(lead.score_fit_licitagram)}</td>
                    <td className="px-3 py-3 text-center">{planoBadge(lead.plano_recomendado)}</td>
                    <td className="px-3 py-3 text-zinc-300 text-xs">{lead.segmento_vertical || '—'}</td>
                    <td className="px-3 py-3 text-center text-zinc-300 font-mono">
                      {lead.total_licitacoes_participadas_12m || 0}
                      <span className="text-zinc-500"> / {lead.total_licitacoes_ganhas_12m || 0}W</span>
                    </td>
                    <td className="px-3 py-3 text-right text-zinc-300 font-mono text-xs">
                      {formatCurrency(lead.ticket_medio_contratos)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {lead.licitacoes_perdidas_por_pouco > 0 ? (
                        <span className="text-red-400 font-bold">{lead.licitacoes_perdidas_por_pouco}</span>
                      ) : (
                        <span className="text-zinc-600">0</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center text-zinc-400 text-xs">
                      {formatRelativeDate(lead.ultima_participacao_data)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {lead.email_institucional_generico ? (
                        <span title={lead.email_institucional_generico} className="text-emerald-400">✓</span>
                      ) : (
                        <span className="text-zinc-600">✗</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {lead.site_institucional ? (
                        <a href={lead.site_institucional} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">↗</a>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {prioridadeBadge(lead.prioridade_outreach)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between text-sm text-zinc-400">
            <span>
              Página {page} de {totalPages} ({total.toLocaleString('pt-BR')} leads)
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <a
                  href={buildUrl({ page: String(page - 1) })}
                  className="px-3 py-1.5 bg-zinc-800 rounded-md hover:bg-zinc-700 transition-colors"
                >
                  ← Anterior
                </a>
              )}
              {page < totalPages && (
                <a
                  href={buildUrl({ page: String(page + 1) })}
                  className="px-3 py-1.5 bg-zinc-800 rounded-md hover:bg-zinc-700 transition-colors"
                >
                  Próxima →
                </a>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
