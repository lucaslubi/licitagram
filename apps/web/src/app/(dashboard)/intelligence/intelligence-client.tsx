'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Stats {
  critical: number
  high: number
  medium: number
  analyzed: number
}

interface TenderInfo {
  objeto: string | null
  orgao_nome: string | null
  uf: string | null
  valor_estimado: number | null
}

interface FraudAlert {
  id: string
  tender_id: string
  alert_type: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM'
  detail: string | null
  companies_involved: any
  created_at: string
  tenders: TenderInfo
}

interface HeatmapEntry {
  uf: string
  total: number
  critical: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SEVERITY_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'CRITICAL', label: 'Critico' },
  { value: 'HIGH', label: 'Alto' },
  { value: 'MEDIUM', label: 'Medio' },
]

const TYPE_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'PRICE_PATTERN', label: 'Padrao de preco' },
  { value: 'BID_ROTATION', label: 'Rodizio de vencedores' },
  { value: 'COMPANY_LINK', label: 'Vinculo societario' },
  { value: 'ADDRESS_CLUSTER', label: 'Endereco compartilhado' },
  { value: 'SUBCONTRACTING', label: 'Subcontratacao suspeita' },
  { value: 'DOCUMENT_FRAUD', label: 'Fraude documental' },
]

const PERIOD_OPTIONS = [
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
]

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-500/15 text-red-400 border-red-500/30',
  HIGH: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  MEDIUM: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
}

const SEVERITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-yellow-500',
}

const TYPE_LABELS: Record<string, string> = {
  PRICE_PATTERN: 'Padrao de Preco Suspeito',
  BID_ROTATION: 'Rodizio de Vencedores',
  COMPANY_LINK: 'Vinculo Societario Oculto',
  ADDRESS_CLUSTER: 'Endereco Compartilhado',
  SUBCONTRACTING: 'Subcontratacao Suspeita',
  DOCUMENT_FRAUD: 'Fraude Documental',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min atras`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h atras`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ontem'
  return `${days}d atras`
}

function formatCurrency(value: number | null): string {
  if (!value) return 'N/I'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

function truncate(str: string | null, max: number): string {
  if (!str) return 'Sem descricao'
  return str.length > max ? str.slice(0, max) + '...' : str
}

// ─── Skeleton Components ────────────────────────────────────────────────────

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map(i => (
        <Card key={i} className="bg-[#23262a] border-[#2d2f33]">
          <CardContent className="p-5">
            <div className="h-3 w-20 bg-[#2d2f33] rounded animate-pulse mb-3" />
            <div className="h-8 w-12 bg-[#2d2f33] rounded animate-pulse" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function FeedSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map(i => (
        <Card key={i} className="bg-[#23262a] border-[#2d2f33]">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="h-6 w-16 bg-[#2d2f33] rounded animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 bg-[#2d2f33] rounded animate-pulse" />
                <div className="h-3 w-full bg-[#2d2f33] rounded animate-pulse" />
                <div className="h-3 w-2/3 bg-[#2d2f33] rounded animate-pulse" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface Props {
  isEnterprise: boolean
  isProfessional: boolean
  planSlug: string
}

export function IntelligenceClient({ isEnterprise, isProfessional, planSlug }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [alerts, setAlerts] = useState<FraudAlert[]>([])
  const [heatmap, setHeatmap] = useState<HeatmapEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loadingStats, setLoadingStats] = useState(true)
  const [loadingFeed, setLoadingFeed] = useState(true)
  const [loadingHeatmap, setLoadingHeatmap] = useState(true)
  const [dismissing, setDismissing] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filters
  const [severity, setSeverity] = useState('')
  const [type, setType] = useState('')
  const [period, setPeriod] = useState('30')

  // ── Fetch stats ──────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      setLoadingStats(true)
      const res = await fetch('/api/intelligence/stats')
      if (res.ok) setStats(await res.json())
    } catch {
      // silent
    } finally {
      setLoadingStats(false)
    }
  }, [])

  // ── Fetch feed ───────────────────────────────────────────────────────────
  const fetchFeed = useCallback(async () => {
    try {
      setLoadingFeed(true)
      const params = new URLSearchParams({ period, page: String(page) })
      if (severity) params.set('severity', severity)
      if (type) params.set('type', type)
      const res = await fetch(`/api/intelligence/feed?${params}`)
      if (res.ok) {
        const data = await res.json()
        setAlerts(data.alerts || [])
        setTotal(data.total || 0)
      }
    } catch {
      // silent
    } finally {
      setLoadingFeed(false)
    }
  }, [severity, type, period, page])

  // ── Fetch heatmap ────────────────────────────────────────────────────────
  const fetchHeatmap = useCallback(async () => {
    if (!isEnterprise) return
    try {
      setLoadingHeatmap(true)
      const res = await fetch('/api/intelligence/heatmap')
      if (res.ok) {
        const data = await res.json()
        setHeatmap(data.heatmap || [])
      }
    } catch {
      // silent
    } finally {
      setLoadingHeatmap(false)
    }
  }, [isEnterprise])

  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { fetchFeed() }, [fetchFeed])
  useEffect(() => { fetchHeatmap() }, [fetchHeatmap])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [severity, type, period])

  // ── Dismiss handler ──────────────────────────────────────────────────────
  async function handleDismiss(alertId: string) {
    try {
      setDismissing(alertId)
      const res = await fetch('/api/intelligence/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId }),
      })
      if (res.ok) {
        setAlerts(prev => prev.filter(a => a.id !== alertId))
        setTotal(prev => Math.max(0, prev - 1))
        fetchStats()
      }
    } catch {
      // silent
    } finally {
      setDismissing(null)
    }
  }

  // ── Locked state for Essencial ───────────────────────────────────────────
  if (!isProfessional) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-full bg-[#23262a] border border-[#2d2f33] flex items-center justify-center">
          <svg className="w-10 h-10 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white">Centro de Inteligencia</h2>
        <p className="text-gray-400 max-w-md mx-auto">
          O Centro de Inteligencia cruza dados de 67 milhoes de CNPJs contra suas licitacoes em tempo real,
          detectando fraudes, cartel e irregularidades automaticamente.
        </p>
        <p className="text-sm text-gray-500">
          Disponivel nos planos Profissional e Enterprise.
        </p>
        <Link href="/billing">
          <Button className="mt-2">
            Fazer upgrade
          </Button>
        </Link>
      </div>
    )
  }

  // ── Determine visible alerts (Professional limit) ────────────────────────
  const visibleAlerts = isProfessional && !isEnterprise ? alerts.slice(0, 5) : alerts
  const hasMore = isProfessional && !isEnterprise && alerts.length > 5
  const totalPages = Math.ceil(total / 20)

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Centro de Inteligencia</h1>
          <p className="text-sm text-gray-400 mt-1">
            Cruzando 67 milhoes de CNPJs contra suas licitacoes em tempo real
          </p>
        </div>
        {isEnterprise && stats && (stats.critical > 0 || stats.high > 0) && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm text-red-400 font-medium">
              {stats.critical + stats.high} alerta{stats.critical + stats.high !== 1 ? 's' : ''} ativo{stats.critical + stats.high !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* ── Stats Cards ──────────────────────────────────────────────────── */}
      {loadingStats ? (
        <StatsSkeleton />
      ) : stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-[#23262a] border-[#2d2f33]">
            <CardContent className="p-5">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Criticos</p>
              <p className="text-3xl font-bold text-red-400 mt-1">{stats.critical}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#23262a] border-[#2d2f33]">
            <CardContent className="p-5">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Alto risco</p>
              <p className="text-3xl font-bold text-orange-400 mt-1">{stats.high}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#23262a] border-[#2d2f33]">
            <CardContent className="p-5">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Medio risco</p>
              <p className="text-3xl font-bold text-yellow-400 mt-1">{stats.medium}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#23262a] border-[#2d2f33]">
            <CardContent className="p-5">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Analisadas</p>
              <p className="text-3xl font-bold text-white mt-1">{stats.analyzed}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={severity}
          onChange={e => setSeverity(e.target.value)}
          className="h-9 rounded-lg bg-[#23262a] border border-[#2d2f33] text-sm text-gray-300 px-3 focus:outline-none focus:border-[#F43E01]/50"
        >
          {SEVERITY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          className="h-9 rounded-lg bg-[#23262a] border border-[#2d2f33] text-sm text-gray-300 px-3 focus:outline-none focus:border-[#F43E01]/50"
        >
          {TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="h-9 rounded-lg bg-[#23262a] border border-[#2d2f33] text-sm text-gray-300 px-3 focus:outline-none focus:border-[#F43E01]/50"
        >
          {PERIOD_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span className="text-xs text-gray-500 ml-auto">
          {total} alerta{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Alert Feed ───────────────────────────────────────────────────── */}
      {loadingFeed ? (
        <FeedSkeleton />
      ) : visibleAlerts.length === 0 ? (
        <Card className="bg-[#23262a] border-[#2d2f33]">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <p className="text-white font-medium">Nenhuma anomalia detectada</p>
            <p className="text-gray-400 text-sm mt-1">O sistema esta monitorando suas licitacoes 24/7.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleAlerts.map(alert => {
            const isExpanded = expandedId === alert.id
            const companies = alert.companies_involved
            const tender = alert.tenders

            return (
              <Card
                key={alert.id}
                className="bg-[#23262a] border-[#2d2f33] hover:border-[#F43E01]/20 transition-colors cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : alert.id)}
              >
                <CardContent className="p-5">
                  {/* Top row: severity + type + time */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${SEVERITY_COLORS[alert.severity]}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                        {alert.severity}
                      </span>
                      <span className="text-sm font-semibold text-white truncate">
                        {TYPE_LABELS[alert.alert_type] || alert.alert_type}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0">
                      {timeAgo(alert.created_at)}
                    </span>
                  </div>

                  {/* Tender info */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                    {tender?.orgao_nome && (
                      <span className="truncate max-w-[250px]">{tender.orgao_nome}</span>
                    )}
                    {tender?.uf && (
                      <span className="px-1.5 py-0.5 rounded bg-[#2d2f33] text-gray-300">{tender.uf}</span>
                    )}
                    {tender?.valor_estimado && (
                      <span className="text-[#F43E01] font-medium">{formatCurrency(tender.valor_estimado)}</span>
                    )}
                  </div>

                  {/* Object truncated */}
                  <p className="mt-2 text-sm text-gray-300 leading-relaxed">
                    {truncate(tender?.objeto, 150)}
                  </p>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-[#2d2f33] space-y-3">
                      {/* Detail text */}
                      {alert.detail && (
                        <p className="text-sm text-gray-300">{alert.detail}</p>
                      )}

                      {/* Companies involved */}
                      {companies && Array.isArray(companies) && companies.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1.5 uppercase tracking-wider font-medium">Empresas envolvidas</p>
                          <div className="space-y-1">
                            {companies.map((c: any, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-sm">
                                <span className="text-gray-300">{c.name || c.razao_social || 'N/I'}</span>
                                {c.cnpj && <span className="text-xs text-gray-500">({c.cnpj})</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-3 pt-2">
                        <Link
                          href={`/opportunities/${alert.tender_id}`}
                          onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 text-sm text-[#F43E01] hover:text-[#F43E01]/80 font-medium transition-colors"
                        >
                          Ver licitacao
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </Link>
                        {isEnterprise && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={e => { e.stopPropagation(); handleDismiss(alert.id) }}
                            disabled={dismissing === alert.id}
                            className="text-gray-400 hover:text-white text-xs"
                          >
                            {dismissing === alert.id ? 'Dispensando...' : 'Dispensar'}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}

          {/* Professional upgrade CTA */}
          {hasMore && (
            <Card className="bg-[#23262a] border-[#F43E01]/20 border-dashed">
              <CardContent className="py-8 text-center">
                <p className="text-white font-medium">Mais {total - 5} alertas disponiveis</p>
                <p className="text-gray-400 text-sm mt-1">Faca upgrade para Enterprise para acessar todos os alertas.</p>
                <Link href="/billing">
                  <Button size="sm" className="mt-3">
                    Upgrade para Enterprise
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Pagination (Enterprise only) */}
          {isEnterprise && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="text-xs"
              >
                Anterior
              </Button>
              <span className="text-xs text-gray-400">
                Pagina {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="text-xs"
              >
                Proxima
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Heatmap (Enterprise only) ────────────────────────────────────── */}
      {isEnterprise ? (
        <Card className="bg-[#23262a] border-[#2d2f33]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-white">Mapa de Risco por UF</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingHeatmap ? (
              <div className="space-y-3">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-4 w-8 bg-[#2d2f33] rounded animate-pulse" />
                    <div className="h-3 flex-1 bg-[#2d2f33] rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : heatmap.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Nenhum dado de risco geografico disponivel.</p>
            ) : (
              <div className="space-y-2.5">
                {heatmap.map(entry => {
                  const maxTotal = heatmap[0]?.total || 1
                  const barWidth = Math.max(8, (entry.total / maxTotal) * 100)
                  const hasCritical = entry.critical > 0

                  return (
                    <div key={entry.uf} className="flex items-center gap-3">
                      <span className="w-8 text-sm font-mono font-medium text-gray-300 text-right flex-shrink-0">
                        {entry.uf}
                      </span>
                      <div className="flex-1 h-5 bg-[#1a1c1f] rounded-md overflow-hidden relative">
                        <div
                          className={`h-full rounded-md transition-all duration-500 ${hasCritical ? 'bg-gradient-to-r from-red-500/60 to-orange-500/40' : 'bg-[#F43E01]/30'}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 w-32 text-right flex-shrink-0">
                        {entry.total} alerta{entry.total !== 1 ? 's' : ''}
                        {entry.critical > 0 && (
                          <span className="text-red-400 ml-1">({entry.critical} crit.)</span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Heatmap locked for Professional */
        <Card className="bg-[#23262a] border-[#2d2f33] border-dashed opacity-60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
              Mapa de Risco por UF
              <span className="text-xs font-normal text-gray-500 bg-[#2d2f33] px-2 py-0.5 rounded">Enterprise</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-400 text-center py-6">
              Mapa de calor geografico disponivel no plano Enterprise.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
