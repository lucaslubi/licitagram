'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatNumber } from '@/lib/format'

interface SystemHealth {
  timestamp: string
  database: {
    tenders: { total: number; analyzed: number; new: number; today: number; processingRate: number }
    matches: {
      total: number; hot: number; today: number; lastHour: number
      pendingNotification: number; keywordOnly: number
      bySource: Record<string, number>
    }
    entities: { companies: number; users: number; subscriptions: number }
    mapCache: number
  }
  subscriptions: {
    byPlan: Record<string, number>
    byStatus: Record<string, number>
  }
  notifications: { telegramLinked: number; whatsappLinked: number; notifiedToday: number }
  infrastructure: {
    redis: { provider: string; host?: string; status: string } | null
    supabase: { plan: string; ram: string; cpu: string }
    vps: { provider: string; ram: string; workers: number }
  }
  alerts: Array<{ level: 'critical' | 'warning' | 'info'; message: string; detail?: string }>
}


function StatusDot({ status }: { status: 'ok' | 'warning' | 'error' }) {
  const colors = { ok: 'bg-emerald-500', warning: 'bg-amber-500', error: 'bg-red-500' }
  return (
    <span className="relative flex h-3 w-3">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${colors[status]} opacity-75`} />
      <span className={`relative inline-flex rounded-full h-3 w-3 ${colors[status]}`} />
    </span>
  )
}

function AlertBanner({ alerts }: { alerts: SystemHealth['alerts'] }) {
  if (alerts.length === 0) return null
  const criticals = alerts.filter(a => a.level === 'critical')
  const warnings = alerts.filter(a => a.level === 'warning')
  const infos = alerts.filter(a => a.level === 'info')
  return (
    <div className="space-y-2">
      {criticals.map((a, i) => (
        <div key={`c-${i}`} className="bg-red-900/20 border border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🚨</span>
            <span className="text-red-400 font-semibold">{a.message}</span>
          </div>
          {a.detail && <p className="text-red-400 text-sm mt-1 ml-7">{a.detail}</p>}
        </div>
      ))}
      {warnings.map((a, i) => (
        <div key={`w-${i}`} className="bg-amber-900/20 border border-amber-800 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span className="text-amber-400 text-sm font-medium">{a.message}</span>
          </div>
          {a.detail && <p className="text-amber-400 text-xs mt-1 ml-7">{a.detail}</p>}
        </div>
      ))}
      {infos.map((a, i) => (
        <div key={`i-${i}`} className="bg-blue-900/20 border border-blue-800 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <span>ℹ️</span>
            <span className="text-blue-400 text-sm">{a.message}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function MetricCard({ title, value, sub, icon, status }: {
  title: string; value: string | number; sub?: string; icon: string; status?: 'ok' | 'warning' | 'error'
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-400 text-xs font-medium uppercase tracking-wide">{title}</span>
          <div className="flex items-center gap-2">
            {status && <StatusDot status={status} />}
            <span className="text-lg">{icon}</span>
          </div>
        </div>
        <p className="text-2xl font-bold text-white font-mono">{typeof value === 'number' ? formatNumber(value) : value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function ProgressBar({ label, value, max, unit }: { label: string; value: number; max: number; unit?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const color = pct >= 90 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-400'
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300 font-mono">{formatNumber(value)} / {formatNumber(max)} {unit || ''}</span>
      </div>
      <div className="h-2 bg-[#2d2f33] rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function SourcePill({ source, count }: { source: string; count: number }) {
  const colors: Record<string, string> = {
    ai_triage: 'bg-purple-900/20 text-purple-400 border-purple-800',
    semantic: 'bg-blue-900/20 text-blue-400 border-blue-800',
    keyword: 'bg-[#2d2f33] text-gray-400 border-[#2d2f33]',
    ai: 'bg-emerald-900/20 text-emerald-400 border-emerald-800',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${colors[source] || 'bg-[#2d2f33] text-gray-400 border-[#2d2f33]'}`}>
      {source} <span className="font-mono">{formatNumber(count)}</span>
    </span>
  )
}

export function SystemHealthDashboard() {
  const [data, setData] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/system-health', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setLastRefresh(new Date())
      setError(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 60_000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto" />
          <p className="text-gray-400 mt-4">Carregando saude do sistema...</p>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="bg-red-900/20 border border-red-800 rounded-lg p-6 text-center">
        <p className="text-red-400">Erro ao carregar dados: {error}</p>
        <button onClick={fetchHealth} className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-500">
          Tentar novamente
        </button>
      </div>
    )
  }

  if (!data) return null

  const db = data.database
  const infra = data.infrastructure

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">System Health</h1>
          <p className="text-gray-400 text-sm">
            Monitoramento em tempo real &middot; Auto-refresh 60s
            {lastRefresh && (
              <span className="ml-2 text-gray-400">
                Atualizado: {lastRefresh.toLocaleTimeString('pt-BR')}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={fetchHealth}
          disabled={loading}
          className="px-4 py-2 bg-[#23262a] hover:bg-[#2d2f33] text-gray-300 rounded-lg text-sm border border-[#2d2f33] disabled:opacity-50 shadow-sm"
        >
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {/* Alerts */}
      <AlertBanner alerts={data.alerts} />

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          title="Tenders Total"
          value={db.tenders.total}
          sub={`${formatNumber(db.tenders.today)} hoje`}
          icon="📋"
          status={db.tenders.new > 1000 ? 'warning' : 'ok'}
        />
        <MetricCard
          title="Matches Total"
          value={db.matches.total}
          sub={`${formatNumber(db.matches.today)} hoje | ${formatNumber(db.matches.lastHour)} ultima hora`}
          icon="🎯"
          status={db.matches.lastHour === 0 ? 'warning' : 'ok'}
        />
        <MetricCard
          title="Super Quentes"
          value={db.matches.hot}
          sub={`${formatNumber(db.matches.pendingNotification)} pendentes`}
          icon="🔥"
          status={db.matches.hot > 0 ? 'ok' : 'warning'}
        />
        <MetricCard
          title="Notificados Hoje"
          value={data.notifications.notifiedToday}
          sub={`TG: ${data.notifications.telegramLinked} | WA: ${data.notifications.whatsappLinked}`}
          icon="📲"
          status={data.notifications.notifiedToday > 0 ? 'ok' : 'warning'}
        />
      </div>

      {/* Pipeline & Infra */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pipeline de Processamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProgressBar label="Tenders Processados" value={db.tenders.analyzed} max={db.tenders.total} />
            <ProgressBar label="AI Triage (vs keyword-only)" value={db.matches.total - db.matches.keywordOnly} max={db.matches.total} unit="matches" />
            <ProgressBar label="Map Cache" value={db.mapCache} max={500} unit="entries" />
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-400 mb-2">Match Sources:</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(db.matches.bySource).sort(([, a], [, b]) => b - a).map(([source, count]) => (
                  <SourcePill key={source} source={source} count={count} />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Infraestrutura</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-[#1a1c1f] rounded-lg">
              <div className="flex items-center gap-3">
                <StatusDot status="ok" />
                <div>
                  <p className="text-sm font-medium text-white">Supabase</p>
                  <p className="text-xs text-gray-400">{infra.supabase.plan}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">{infra.supabase.ram} RAM</p>
                <p className="text-xs text-gray-400">{infra.supabase.cpu}</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-[#1a1c1f] rounded-lg">
              <div className="flex items-center gap-3">
                <StatusDot status="ok" />
                <div>
                  <p className="text-sm font-medium text-white">VPS ({infra.vps.provider})</p>
                  <p className="text-xs text-gray-400">{infra.vps.workers} workers PM2</p>
                </div>
              </div>
              <p className="text-xs text-gray-400">{infra.vps.ram} RAM</p>
            </div>

            {infra.redis && (
              <div className="flex items-center justify-between p-3 bg-[#1a1c1f] rounded-lg">
                <div className="flex items-center gap-3">
                  <StatusDot status={infra.redis.status === 'connected' ? 'ok' : 'error'} />
                  <div>
                    <p className="text-sm font-medium text-white">Redis ({infra.redis.provider})</p>
                    <p className="text-xs text-gray-400 font-mono">{infra.redis.host || ''}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${infra.redis.status === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-900/20 text-red-400'}`}>
                  {infra.redis.status}
                </span>
              </div>
            )}

            <div className="pt-2 border-t">
              <p className="text-xs text-gray-400 mb-2">Assinaturas por plano:</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(data.subscriptions.byPlan).map(([plan, count]) => (
                  <div key={plan} className="flex items-center justify-between bg-[#1a1c1f] rounded px-2.5 py-1.5">
                    <span className="text-xs text-gray-400 capitalize">{plan}</span>
                    <span className="text-xs font-mono text-white font-bold">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Entities */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard title="Empresas" value={db.entities.companies} icon="🏢" />
        <MetricCard title="Usuarios" value={db.entities.users} icon="👥" />
        <MetricCard title="Assinaturas Ativas" value={db.entities.subscriptions} icon="💳" />
      </div>

      {/* Workers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Workers (PM2)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {['scraping', 'extraction', 'matching', 'alerts', 'telegram', 'whatsapp', 'queue-metrics'].map(name => (
              <div key={name} className="flex items-center gap-2 p-2.5 bg-[#1a1c1f] rounded-lg">
                <StatusDot status="ok" />
                <div>
                  <p className="text-xs font-medium text-white">worker-{name}</p>
                  <p className="text-xs text-gray-400">online</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Status real via SSH. Dashboard mostra config esperada.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
