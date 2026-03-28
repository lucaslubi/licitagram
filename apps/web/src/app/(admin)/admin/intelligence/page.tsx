import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { StatsCard } from '@/components/admin/stats-card'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const PAGE_SIZE = 50

const TYPE_LABELS: Record<string, string> = {
  SOCIO_EM_COMUM: 'Socio em Comum',
  EMPRESA_RECENTE: 'Empresa Recente',
  CAPITAL_INCOMPATIVEL: 'Capital Incompativel',
  EMPRESA_SANCIONADA: 'Empresa Sancionada',
  ENDERECO_COMPARTILHADO: 'Endereco Compartilhado',
}

const TYPE_ICONS: Record<string, string> = {
  SOCIO_EM_COMUM: '\u{1F465}',
  EMPRESA_RECENTE: '\u{1F195}',
  CAPITAL_INCOMPATIVEL: '\u{1F4B0}',
  EMPRESA_SANCIONADA: '\u{26D4}',
  ENDERECO_COMPARTILHADO: '\u{1F3E0}',
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  CRITICAL: {
    bg: 'bg-red-900/20',
    border: 'border-red-500/30',
    text: 'text-red-400',
    badge: 'bg-red-900/40 text-red-400 border-red-500/40',
  },
  HIGH: {
    bg: 'bg-orange-900/20',
    border: 'border-orange-500/30',
    text: 'text-orange-400',
    badge: 'bg-orange-900/40 text-orange-400 border-orange-500/40',
  },
  MEDIUM: {
    bg: 'bg-yellow-900/20',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400',
    badge: 'bg-yellow-900/40 text-yellow-400 border-yellow-500/40',
  },
}

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-blue-900/30 text-blue-400',
  dismissed: 'bg-gray-700/30 text-gray-400',
  resolved: 'bg-emerald-900/30 text-emerald-400',
}

function formatCNPJ(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, '')
  if (digits.length !== 14) return cnpj
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `ha ${diffMin} min`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `ha ${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `ha ${diffDays}d`
  const diffMonths = Math.floor(diffDays / 30)
  return `ha ${diffMonths} meses`
}

export default async function AdminIntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    severity?: string
    type?: string
    search?: string
  }>
}) {
  await requirePlatformAdmin()
  const params = await searchParams

  const page = Math.max(1, parseInt(params.page || '1'))
  const severityFilter = params.severity || ''
  const typeFilter = params.type || ''
  const searchFilter = params.search || ''
  const offset = (page - 1) * PAGE_SIZE

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Fetch counts for stats cards
  const [totalResult, criticalResult, highResult, mediumResult] = await Promise.all([
    supabase.from('fraud_alerts').select('id', { count: 'exact', head: true }),
    supabase.from('fraud_alerts').select('id', { count: 'exact', head: true }).eq('severity', 'CRITICAL'),
    supabase.from('fraud_alerts').select('id', { count: 'exact', head: true }).eq('severity', 'HIGH'),
    supabase.from('fraud_alerts').select('id', { count: 'exact', head: true }).eq('severity', 'MEDIUM'),
  ])

  const totalCount = totalResult.count || 0
  const criticalCount = criticalResult.count || 0
  const highCount = highResult.count || 0
  const mediumCount = mediumResult.count || 0

  // Build filtered query
  let query = supabase
    .from('fraud_alerts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (severityFilter) {
    query = query.eq('severity', severityFilter)
  }
  if (typeFilter) {
    query = query.eq('type', typeFilter)
  }
  if (searchFilter) {
    query = query.or(`detail.ilike.%${searchFilter}%,metadata->>cnpj.ilike.%${searchFilter}%`)
  }

  const { data: alerts, count: filteredCount } = await query.range(offset, offset + PAGE_SIZE - 1)

  const totalPages = Math.ceil((filteredCount || 0) / PAGE_SIZE)

  function buildUrl(overrides: Record<string, string>) {
    const base: Record<string, string> = {
      severity: severityFilter,
      type: typeFilter,
      search: searchFilter,
      page: String(page),
    }
    const merged = { ...base, ...overrides }
    const parts = Object.entries(merged)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    return `/admin/intelligence${parts.length ? '?' + parts.join('&') : ''}`
  }

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold mb-6">Central de Inteligencia</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <StatsCard
          title="Total Alertas"
          value={totalCount.toLocaleString('pt-BR')}
          description="Todos os alertas detectados"
        />
        <StatsCard
          title="Criticos"
          value={criticalCount.toLocaleString('pt-BR')}
          description="Severidade critica"
        />
        <StatsCard
          title="Alto Risco"
          value={highCount.toLocaleString('pt-BR')}
          description="Severidade alta"
        />
        <StatsCard
          title="Medio Risco"
          value={mediumCount.toLocaleString('pt-BR')}
          description="Severidade media"
        />
      </div>

      {/* Filters */}
      <form className="mb-6 flex flex-col sm:flex-row gap-3">
        <select
          name="severity"
          defaultValue={severityFilter}
          className="px-3 py-2 bg-[#1a1c1f] border border-[#2d2f33] rounded-md text-sm text-white"
        >
          <option value="">Todas severidades</option>
          <option value="CRITICAL">Critico</option>
          <option value="HIGH">Alto</option>
          <option value="MEDIUM">Medio</option>
        </select>

        <select
          name="type"
          defaultValue={typeFilter}
          className="px-3 py-2 bg-[#1a1c1f] border border-[#2d2f33] rounded-md text-sm text-white"
        >
          <option value="">Todos os tipos</option>
          {Object.entries(TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        <input
          name="search"
          type="text"
          placeholder="Buscar por CNPJ ou empresa..."
          defaultValue={searchFilter}
          className="px-3 py-2 bg-[#1a1c1f] border border-[#2d2f33] rounded-md text-sm text-white placeholder-gray-500 flex-1 min-w-0"
        />

        <button
          type="submit"
          className="px-4 py-2 bg-brand text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Filtrar
        </button>
      </form>

      {/* Alert Feed */}
      <div className="space-y-3">
        {alerts && alerts.length > 0 ? (
          alerts.map((alert: any) => {
            const styles = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.MEDIUM
            const typeLabel = TYPE_LABELS[alert.type] || alert.type
            const typeIcon = TYPE_ICONS[alert.type] || '\u{1F514}'

            return (
              <div
                key={alert.id}
                className={`${styles.bg} border ${styles.border} rounded-lg p-4 sm:p-5`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Top row: severity badge + type + time */}
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${styles.badge}`}
                      >
                        {alert.severity}
                      </span>
                      <span className="text-sm text-gray-300">
                        {typeIcon} {typeLabel}
                      </span>
                      <span className="text-xs text-gray-500">
                        {timeAgo(alert.created_at)}
                      </span>
                      {alert.status && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[alert.status] || STATUS_STYLES.new}`}
                        >
                          {alert.status}
                        </span>
                      )}
                    </div>

                    {/* Companies involved */}
                    {alert.companies && Array.isArray(alert.companies) && alert.companies.length > 0 && (
                      <div className="mb-2">
                        {alert.companies.map((company: any, idx: number) => (
                          <span key={idx} className="text-sm text-gray-200 mr-3">
                            <span className="font-medium">{company.name || company.razao_social}</span>
                            {company.cnpj && (
                              <span className="text-gray-400 ml-1 text-xs">
                                ({formatCNPJ(company.cnpj)})
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Detail */}
                    {alert.detail && (
                      <p className="text-sm text-gray-300 mb-2 leading-relaxed">
                        {alert.detail}
                      </p>
                    )}

                    {/* Metadata (collapsible) */}
                    {alert.metadata && Object.keys(alert.metadata).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition-colors">
                          Ver metadata
                        </summary>
                        <pre className="mt-2 text-xs text-gray-400 bg-[#111315] rounded p-3 overflow-x-auto max-h-48 border border-[#2d2f33]">
                          {JSON.stringify(alert.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>

                  {/* Link to tender */}
                  {alert.tender_id && (
                    <Link
                      href={`/opportunities/${alert.match_id || alert.tender_id}`}
                      className="text-xs text-brand hover:underline whitespace-nowrap shrink-0"
                    >
                      Ver licitacao &rarr;
                    </Link>
                  )}
                </div>
              </div>
            )
          })
        ) : (
          <div className="bg-[#1a1c1f] rounded-lg border border-[#2d2f33] p-8 text-center text-gray-400">
            Nenhum alerta encontrado.
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-6">
        <p className="text-sm text-gray-400">
          {(filteredCount || 0).toLocaleString('pt-BR')} alertas · Pagina {page} de{' '}
          {totalPages || 1}
        </p>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={buildUrl({ page: String(page - 1) })}
              className="px-3 py-1.5 border border-[#2d2f33] rounded text-sm hover:bg-[#2d2f33] transition-colors"
            >
              Anterior
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={buildUrl({ page: String(page + 1) })}
              className="px-3 py-1.5 border border-[#2d2f33] rounded text-sm hover:bg-[#2d2f33] transition-colors"
            >
              Proxima
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
