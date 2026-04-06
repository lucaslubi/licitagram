import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

const DATA_API_URL = process.env.DATA_API_URL || 'http://85.31.60.53:3998'

function formatNumber(n: number): string {
  return new Intl.NumberFormat('pt-BR').format(n)
}

function formatCurrency(value: number | null): string {
  if (!value) return 'R$ 0'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

export default async function LeadsDashboardPage() {
  await requirePlatformAdmin()

  let dashboard: any = null
  let fetchError = false

  try {
    const res = await fetch(`${DATA_API_URL}/api/leads/dashboard`, { cache: 'no-store' })
    if (res.ok) {
      dashboard = await res.json()
    } else {
      fetchError = true
    }
  } catch {
    fetchError = true
  }

  if (fetchError || !dashboard) {
    return (
      <div className="p-8 text-center bg-red-900/20 rounded-xl border border-red-800">
        <h1 className="text-xl font-bold mb-2">Lead Engine Dashboard</h1>
        <p className="text-red-400">Erro ao conectar com o Data API (VPS2). Verifique se o serviço está rodando.</p>
      </div>
    )
  }

  const emailStats = dashboard.emailStats || {}

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Lead Engine — Dashboard</h1>
          <p className="text-sm text-zinc-400 mt-1">Visão geral da base de leads qualificados</p>
        </div>
        <Link
          href="/admin/leads"
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          Ver Leads →
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="p-4 bg-zinc-900/60 border-zinc-800">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">Total Leads</div>
          <div className="text-2xl font-bold text-white mt-1">{formatNumber(dashboard.total)}</div>
        </Card>
        <Card className="p-4 bg-zinc-900/60 border-zinc-800">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">Com Email Genérico</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{formatNumber(emailStats.comEmail || 0)}</div>
          <div className="text-xs text-zinc-500">{emailStats.taxaEnriquecimentoEmail || 0}% da base</div>
        </Card>
        <Card className="p-4 bg-zinc-900/60 border-zinc-800">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">Com Site</div>
          <div className="text-2xl font-bold text-blue-400 mt-1">{formatNumber(emailStats.comSite || 0)}</div>
          <div className="text-xs text-zinc-500">{emailStats.taxaEnriquecimentoSite || 0}% da base</div>
        </Card>
        <Card className="p-4 bg-zinc-900/60 border-zinc-800">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">Email Validado</div>
          <div className="text-2xl font-bold text-violet-400 mt-1">{formatNumber(emailStats.emailValidado || 0)}</div>
        </Card>
      </div>

      {/* Distribution cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Score Distribution */}
        <Card className="p-5 bg-zinc-900/60 border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">Distribuição por Score</h2>
          <div className="space-y-3">
            {(dashboard.distribuicaoScore || []).map((row: any) => {
              const total = dashboard.total || 1
              const pct = ((row.count / total) * 100).toFixed(1)
              const isHot = row.faixa?.includes('HOT')
              const isWarm = row.faixa?.includes('WARM')
              const isCold = row.faixa?.includes('COLD')
              const barColor = isHot ? 'bg-emerald-500' : isWarm ? 'bg-amber-500' : isCold ? 'bg-sky-500' : 'bg-zinc-600'
              return (
                <div key={row.faixa}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-zinc-300">{row.faixa}</span>
                    <span className="text-zinc-400 font-mono">{formatNumber(row.count)} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Priority Distribution */}
        <Card className="p-5 bg-zinc-900/60 border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">Distribuição por Prioridade</h2>
          <div className="space-y-3">
            {(dashboard.distribuicaoPrioridade || []).map((row: any) => {
              const colors: Record<string, string> = { HOT: 'bg-red-500', WARM: 'bg-amber-500', COLD: 'bg-sky-500', NAO_DISPARAR: 'bg-zinc-600' }
              const pct = dashboard.total > 0 ? ((row.count / dashboard.total) * 100).toFixed(1) : '0'
              return (
                <div key={row.prioridade_outreach} className="flex items-center gap-3">
                  <Badge className={`${colors[row.prioridade_outreach] || 'bg-zinc-600'} text-white w-28 justify-center`}>
                    {row.prioridade_outreach}
                  </Badge>
                  <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full ${colors[row.prioridade_outreach] || 'bg-zinc-600'} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-zinc-400 font-mono w-24 text-right">{formatNumber(row.count)} ({pct}%)</span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Plano Distribution */}
        <Card className="p-5 bg-zinc-900/60 border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">Distribuição por Plano Recomendado</h2>
          <div className="space-y-3">
            {(dashboard.distribuicaoPlano || []).map((row: any) => {
              const colors: Record<string, string> = { ENTERPRISE: 'bg-violet-500', PROFISSIONAL: 'bg-blue-500', ESSENCIAL: 'bg-zinc-500' }
              return (
                <div key={row.plano_recomendado} className="flex items-center gap-3">
                  <Badge className={`${colors[row.plano_recomendado] || 'bg-zinc-600'} text-white w-28 justify-center`}>
                    {row.plano_recomendado}
                  </Badge>
                  <span className="text-sm text-zinc-300 font-mono">{formatNumber(row.count)}</span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Top UFs */}
        <Card className="p-5 bg-zinc-900/60 border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">Top UFs</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(dashboard.distribuicaoUf || []).slice(0, 15).map((row: any) => (
              <div key={row.uf} className="flex items-center justify-between text-sm">
                <Link href={`/admin/leads?uf=${row.uf}`} className="text-emerald-400 hover:underline font-mono">{row.uf}</Link>
                <div className="flex gap-3">
                  <span className="text-zinc-300 font-mono">{formatNumber(row.count)}</span>
                  <span className="text-zinc-500 text-xs">score médio: {Number(row.score_medio).toFixed(0)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Top Segmentos */}
        <Card className="p-5 bg-zinc-900/60 border-zinc-800 lg:col-span-2">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">Top Segmentos Verticais</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
            {(dashboard.distribuicaoSegmento || []).map((row: any) => (
              <div key={row.segmento_vertical} className="flex items-center justify-between text-sm p-2 bg-zinc-800/40 rounded-lg">
                <Link href={`/admin/leads?segmento=${encodeURIComponent(row.segmento_vertical)}`} className="text-zinc-300 hover:text-emerald-400 truncate max-w-[60%]">
                  {row.segmento_vertical}
                </Link>
                <div className="flex gap-3 shrink-0">
                  <span className="text-zinc-400 font-mono text-xs">{formatNumber(row.count)} leads</span>
                  <span className="text-zinc-500 text-xs">{formatCurrency(row.ticket_medio_seg)} ticket</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Outreach Funnel */}
        <Card className="p-5 bg-zinc-900/60 border-zinc-800 lg:col-span-2">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">Funil de Outreach</h2>
          <div className="flex flex-wrap gap-3">
            {(dashboard.funilOutreach || []).map((row: any) => {
              const statusColors: Record<string, string> = {
                NAO_CONTACTADO: 'bg-zinc-700', FILA: 'bg-yellow-700', ENVIADO: 'bg-blue-700',
                ENTREGUE: 'bg-blue-600', ABERTO: 'bg-emerald-700', CLICOU: 'bg-emerald-600',
                RESPONDEU: 'bg-emerald-500', CONVERTIDO: 'bg-violet-600', BOUNCE: 'bg-red-700', OPT_OUT: 'bg-orange-700',
              }
              return (
                <div key={row.status_outreach} className={`px-4 py-3 rounded-lg ${statusColors[row.status_outreach] || 'bg-zinc-700'} text-white text-center min-w-[120px]`}>
                  <div className="text-lg font-bold">{formatNumber(row.count)}</div>
                  <div className="text-xs opacity-80">{row.status_outreach}</div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
