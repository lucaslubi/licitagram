// @ts-nocheck
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

/* ════════════════════════════════════════════════════════════════════════════
 * TYPES — match the API response from /api/admin/monitoring
 * ════════════════════════════════════════════════════════════════════════════ */

interface WorkerInfo {
  name: string
  pid: number
  memory: number      // MB
  cpu: number          // %
  uptime: string       // e.g. "2d 4h"
  restarts: number
  status: string       // "online" | "errored" | "stopped"
}

interface QueueStats {
  wait: number
  active: number
  delayed: number
  completed: number
  failed: number
}

interface VpsMetrics {
  ram_total: number    // MB
  ram_used: number     // MB
  ram_free: number     // MB
  cpu_load: number[]   // [1min, 5min, 15min]
  disk_used_pct: number
  uptime_hours: number
}

interface AlertEntry {
  level: 'critical' | 'warning' | 'info'
  message: string
  detail?: string
}

interface MonitoringData {
  timestamp: string
  vps_reachable: boolean
  workers: WorkerInfo[]
  queues: Record<string, QueueStats>
  vps: VpsMetrics | null
  database: Record<string, number>
  alerts: AlertEntry[]
}

interface HistoryData {
  metrics: Record<string, Array<{ value: number; time: string }>>
}

/* ════════════════════════════════════════════════════════════════════════════
 * HELPERS
 * ════════════════════════════════════════════════════════════════════════════ */

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString('pt-BR')
}

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 5) return 'agora'
  if (diff < 60) return `${diff}s atras`
  if (diff < 3600) return `${Math.floor(diff / 60)}m atras`
  return `${Math.floor(diff / 3600)}h atras`
}

function statusColor(status: string): string {
  if (status === 'online') return 'bg-emerald-500'
  if (status === 'errored' || status === 'error') return 'bg-red-500'
  if (status === 'stopped') return 'bg-gray-400'
  return 'bg-yellow-500'
}

function statusBadgeClasses(status: string): string {
  if (status === 'online') return 'bg-emerald-100 text-emerald-700 border-emerald-300'
  if (status === 'errored' || status === 'error') return 'bg-red-100 text-red-700 border-red-300'
  if (status === 'stopped') return 'bg-gray-100 text-gray-600 border-gray-300'
  return 'bg-yellow-100 text-yellow-700 border-yellow-300'
}

function mbToGb(mb: number): number {
  return mb / 1024
}

/* ════════════════════════════════════════════════════════════════════════════
 * MINI CHART COMPONENTS (pure CSS/SVG — no recharts dependency)
 * ════════════════════════════════════════════════════════════════════════════ */

function MiniBar({ value, max, color = 'bg-blue-500' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function GaugeBar({ label, value, max, unit, color }: {
  label: string; value: number; max: number; unit?: string; color?: string
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const barColor = color || (pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500')
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-700 font-mono">
          {typeof value === 'number' ? value.toFixed(1) : value} / {typeof max === 'number' ? max.toFixed(1) : max}{' '}
          {unit || ''}
          <span className="text-gray-400 ml-1">({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** Simple SVG line/area chart */
function MiniLineChart({ data, lines, height = 120 }: {
  data: Array<Record<string, number>>
  lines: Array<{ key: string; color: string; fill?: boolean }>
  height?: number
}) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-gray-400 text-xs" style={{ height }}>
        Sem dados historicos
      </div>
    )
  }
  const width = 400
  const pad = { top: 8, right: 8, bottom: 8, left: 8 }
  const cW = width - pad.left - pad.right
  const cH = height - pad.top - pad.bottom

  let gMax = 0
  for (const pt of data) {
    for (const l of lines) {
      const v = pt[l.key] || 0
      if (v > gMax) gMax = v
    }
  }
  if (gMax === 0) gMax = 1

  const toX = (i: number) => pad.left + (i / (data.length - 1)) * cW
  const toY = (v: number) => pad.top + cH - (v / gMax) * cH

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={pad.left} x2={width - pad.right} y1={pad.top + cH * (1 - f)} y2={pad.top + cH * (1 - f)} stroke="rgba(0,0,0,0.04)" strokeWidth={0.5} />
      ))}
      {lines.map((line) => {
        const pts = data.map((pt, i) => `${toX(i)},${toY(pt[line.key] || 0)}`).join(' ')
        return (
          <g key={line.key}>
            {line.fill && <polygon points={`${toX(0)},${toY(0)} ${pts} ${toX(data.length - 1)},${toY(0)}`} fill={line.color} fillOpacity={0.12} />}
            <polyline points={pts} fill="none" stroke={line.color} strokeWidth={1.5} strokeLinejoin="round" />
          </g>
        )
      })}
    </svg>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * SKELETON
 * ════════════════════════════════════════════════════════════════════════════ */

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 max-w-7xl">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-5 border border-gray-200">
            <Skeleton className="h-4 w-24 mb-3" />
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-4 border border-gray-200">
            <Skeleton className="h-4 w-28 mb-2" />
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-1.5 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * SUMMARY CARD
 * ════════════════════════════════════════════════════════════════════════════ */

function SummaryCard({ title, value, status, icon, bar }: {
  title: string; value: string; status: 'ok' | 'warning' | 'error'; icon: React.ReactNode; bar?: { value: number; max: number }
}) {
  const borderColor = status === 'ok' ? 'border-emerald-200' : status === 'warning' ? 'border-amber-200' : 'border-red-200'
  const dotColor = status === 'ok' ? 'bg-emerald-500' : status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
  const iconColor = status === 'ok' ? 'text-emerald-600' : status === 'warning' ? 'text-amber-600' : 'text-red-600'

  return (
    <div className={`bg-white rounded-xl border ${borderColor} p-4 sm:p-5`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">{title}</span>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {status === 'ok' && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-75`} />}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dotColor}`} />
          </span>
          <span className={iconColor}>{icon}</span>
        </div>
      </div>
      <p className="text-xl sm:text-2xl font-bold text-gray-900 font-mono">{value}</p>
      {bar && (
        <div className="mt-2">
          <MiniBar value={bar.value} max={bar.max} color={bar.max > 0 && bar.value / bar.max > 0.9 ? 'bg-red-500' : bar.max > 0 && bar.value / bar.max > 0.7 ? 'bg-amber-500' : 'bg-emerald-500'} />
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * MAIN DASHBOARD
 * ════════════════════════════════════════════════════════════════════════════ */

export function MonitoringDashboard() {
  const [data, setData] = useState<MonitoringData | null>(null)
  const [history, setHistory] = useState<HistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const tickRef = useRef(0)

  // ─── Fetch live data ─────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/monitoring', { cache: 'no-store' })
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

  // ─── Fetch history (once + every 5 min) ──────────────────────────
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/monitoring/history?hours=24&limit=3000', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      setHistory(json)
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchData()
    fetchHistory()
    const interval = setInterval(() => {
      fetchData()
      tickRef.current++
      if (tickRef.current % 60 === 0) fetchHistory()
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchData, fetchHistory])

  // ─── Actions ─────────────────────────────────────────────────────
  async function handleAction(action: string, target: string) {
    setActionLoading(`${action}:${target}`)
    setActionMessage(null)
    try {
      const res = await fetch('/api/admin/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, target }),
      })
      const json = await res.json()
      setActionMessage(json.message || json.error || 'Concluido')
      setTimeout(() => setActionMessage(null), 4000)
    } catch (err) {
      setActionMessage('Erro: ' + String(err))
    } finally {
      setActionLoading(null)
    }
  }

  // ─── Loading / error states ──────────────────────────────────────
  if (loading && !data) return <DashboardSkeleton />

  if (error && !data) {
    return (
      <div className="bg-red-50 border border-red-300 rounded-xl p-6 text-center max-w-lg mx-auto mt-12">
        <p className="text-red-600 mb-3">Erro ao carregar monitoramento</p>
        <p className="text-red-400 text-sm mb-4">{error}</p>
        <button onClick={fetchData} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-500">
          Tentar novamente
        </button>
      </div>
    )
  }

  if (!data) return null

  const { workers, queues, vps, database, alerts, vps_reachable } = data

  // Derived stats
  const workersOnline = workers.filter((w) => w.status === 'online').length
  const totalBacklog = Object.values(queues).reduce((sum, q) => sum + q.wait, 0)
  const ramUsedGb = vps ? mbToGb(vps.ram_used) : 0
  const ramTotalGb = vps ? mbToGb(vps.ram_total) : 7.8
  const cpuLoad = vps?.cpu_load?.[0] ?? 0

  // Queue entries as sorted array for the table
  const queueEntries = Object.entries(queues).sort((a, b) => b[1].wait - a[1].wait)

  // Major queues for charts
  const majorQueueNames = ['extraction', 'semantic-matching', 'scraping', 'notification', 'matching', 'ai-triage']
  const chartQueues = majorQueueNames.filter((q) => queues[q] || (history?.metrics && Object.keys(history.metrics).some((k) => k.includes(q))))

  // Build chart data from history metrics
  function getQueueChartData(queueName: string) {
    if (!history?.metrics) return []
    const waitKey = Object.keys(history.metrics).find((k) => k.includes(queueName) && k.includes('wait'))
    const activeKey = Object.keys(history.metrics).find((k) => k.includes(queueName) && k.includes('active'))
    const failedKey = Object.keys(history.metrics).find((k) => k.includes(queueName) && k.includes('fail'))

    const waitData = waitKey ? history.metrics[waitKey] : []
    const activeData = activeKey ? history.metrics[activeKey] : []
    const failedData = failedKey ? history.metrics[failedKey] : []

    const maxLen = Math.max(waitData.length, activeData.length, failedData.length)
    if (maxLen === 0) return []

    const result: Array<{ waiting: number; active: number; failed: number }> = []
    for (let i = 0; i < maxLen; i++) {
      result.push({
        waiting: waitData[i]?.value ?? 0,
        active: activeData[i]?.value ?? 0,
        failed: failedData[i]?.value ?? 0,
      })
    }
    return result
  }

  function getVpsChartData(key: string) {
    if (!history?.metrics) return []
    const metricKey = Object.keys(history.metrics).find((k) => k.includes(key))
    if (!metricKey) return []
    return history.metrics[metricKey].map((pt) => ({ value: pt.value }))
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monitoramento</h1>
          <p className="text-gray-500 text-sm">
            Tempo real &middot; Atualiza a cada 5s
            {lastRefresh && (
              <span className="ml-2 text-gray-400">
                Ultima atualizacao: {timeAgo(lastRefresh)}
              </span>
            )}
            {!vps_reachable && (
              <span className="ml-2 text-red-500 font-medium">VPS offline</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {actionMessage && (
            <span className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
              {actionMessage}
            </span>
          )}
          <button
            onClick={() => { fetchData(); fetchHistory() }}
            disabled={loading}
            className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm border border-gray-300 disabled:opacity-50 shadow-sm transition-colors"
          >
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      {/* ─── Alerts ─────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.filter((a) => a.level === 'critical').map((a, i) => (
            <div key={`c-${i}`} className="bg-red-50 border border-red-300 rounded-lg p-3 flex items-start gap-2">
              <span className="text-red-500 mt-0.5 shrink-0">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" /></svg>
              </span>
              <div>
                <p className="text-red-800 text-sm font-medium">{a.message}</p>
                {a.detail && <p className="text-red-600 text-xs mt-0.5">{a.detail}</p>}
              </div>
            </div>
          ))}
          {alerts.filter((a) => a.level === 'warning').map((a, i) => (
            <div key={`w-${i}`} className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-start gap-2">
              <span className="text-amber-500 mt-0.5 shrink-0">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
              </span>
              <div>
                <p className="text-amber-800 text-sm font-medium">{a.message}</p>
                {a.detail && <p className="text-amber-600 text-xs mt-0.5">{a.detail}</p>}
              </div>
            </div>
          ))}
          {alerts.filter((a) => a.level === 'info').map((a, i) => (
            <div key={`i-${i}`} className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
              <span className="text-blue-500 mt-0.5 shrink-0">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" /></svg>
              </span>
              <p className="text-blue-800 text-sm">{a.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* ─── 1. Header Stats Row ────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          title="Workers Online"
          value={`${workersOnline} / ${workers.length}`}
          status={workersOnline === workers.length ? 'ok' : workersOnline > 0 ? 'warning' : 'error'}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>}
        />
        <SummaryCard
          title="Backlog Filas"
          value={formatNumber(totalBacklog)}
          status={totalBacklog > 5000 ? 'error' : totalBacklog > 1000 ? 'warning' : 'ok'}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>}
        />
        <SummaryCard
          title="RAM"
          value={`${ramUsedGb.toFixed(1)} / ${ramTotalGb.toFixed(1)} GB`}
          status={ramTotalGb > 0 ? ((ramUsedGb / ramTotalGb) > 0.9 ? 'error' : (ramUsedGb / ramTotalGb) > 0.7 ? 'warning' : 'ok') : 'ok'}
          bar={vps ? { value: ramUsedGb, max: ramTotalGb } : undefined}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
        />
        <SummaryCard
          title="CPU Load"
          value={cpuLoad > 0 ? cpuLoad.toFixed(2) : '—'}
          status={cpuLoad > 8 ? 'error' : cpuLoad > 4 ? 'warning' : 'ok'}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
        />
      </div>

      {/* ─── 2. Workers Section ──────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Workers PM2</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {workers.map((w) => (
            <div key={w.name} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    {w.status === 'online' && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${statusColor(w.status)} opacity-75`} />}
                    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${statusColor(w.status)}`} />
                  </span>
                  <span className="text-sm font-medium text-gray-900 truncate">{w.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {w.restarts > 5 && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-mono">{w.restarts}x</span>
                  )}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusBadgeClasses(w.status)}`}>{w.status}</span>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <div className="flex justify-between text-gray-500 mb-0.5">
                    <span>Memoria</span>
                    <span className="font-mono text-gray-700">{w.memory > 0 ? `${w.memory.toFixed(0)} MB` : '—'}</span>
                  </div>
                  <MiniBar value={w.memory} max={512} color="bg-blue-500" />
                </div>
                <div>
                  <div className="flex justify-between text-gray-500 mb-0.5">
                    <span>CPU</span>
                    <span className="font-mono text-gray-700">{w.cpu > 0 ? `${w.cpu.toFixed(1)}%` : '—'}</span>
                  </div>
                  <MiniBar value={w.cpu} max={100} color="bg-purple-500" />
                </div>
                <div className="flex justify-between text-gray-500 pt-1">
                  <span>Uptime</span>
                  <span className="font-mono text-gray-700">{w.uptime || '—'}</span>
                </div>
                {w.pid > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>PID</span>
                    <span className="font-mono text-gray-700">{w.pid}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-500">
                  <span>Restarts</span>
                  <span className={`font-mono ${w.restarts > 5 ? 'text-red-600 font-bold' : 'text-gray-700'}`}>{w.restarts}</span>
                </div>
              </div>

              <button
                onClick={() => handleAction('restart_worker', w.name)}
                disabled={actionLoading === `restart_worker:${w.name}`}
                className="mt-3 w-full text-xs py-1.5 px-3 bg-gray-50 hover:bg-red-50 text-gray-600 hover:text-red-700 rounded-lg border border-gray-200 hover:border-red-300 transition-colors disabled:opacity-50"
              >
                {actionLoading === `restart_worker:${w.name}` ? 'Reiniciando...' : 'Forcar Restart'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ─── 3. Queue Charts Section ─────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Filas (Ultimas 24h)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {chartQueues.map((qName) => {
            const queueData = queues[qName]
            const chartData = getQueueChartData(qName)

            return (
              <div key={qName} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-800">{qName}</h3>
                  <button
                    onClick={() => handleAction('drain_queue', qName)}
                    disabled={actionLoading === `drain_queue:${qName}`}
                    className="text-[10px] py-1 px-2 bg-gray-50 hover:bg-amber-50 text-gray-500 hover:text-amber-700 rounded border border-gray-200 hover:border-amber-300 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === `drain_queue:${qName}` ? '...' : 'Limpar Fila'}
                  </button>
                </div>

                <div className="bg-gray-50 rounded-lg p-1 mb-3">
                  <MiniLineChart
                    data={chartData}
                    lines={[
                      { key: 'waiting', color: '#f59e0b', fill: true },
                      { key: 'active', color: '#3b82f6' },
                      { key: 'failed', color: '#ef4444' },
                    ]}
                    height={100}
                  />
                </div>

                <div className="flex items-center gap-3 mb-2 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Aguardando</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Ativo</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Falhas</span>
                </div>

                {queueData && (
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-gray-400">Aguard.</p>
                      <p className="text-sm font-bold text-amber-600 font-mono">{formatNumber(queueData.wait)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Ativo</p>
                      <p className="text-sm font-bold text-blue-600 font-mono">{formatNumber(queueData.active)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Concl.</p>
                      <p className="text-sm font-bold text-emerald-600 font-mono">{formatNumber(queueData.completed)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Falhas</p>
                      <p className="text-sm font-bold text-red-600 font-mono">{formatNumber(queueData.failed)}</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* All queues table */}
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Todas as Filas</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
                  <th className="text-left px-4 py-2 font-medium">Fila</th>
                  <th className="text-right px-3 py-2 font-medium">Aguardando</th>
                  <th className="text-right px-3 py-2 font-medium">Ativo</th>
                  <th className="text-right px-3 py-2 font-medium">Atrasado</th>
                  <th className="text-right px-3 py-2 font-medium">Concluido</th>
                  <th className="text-right px-3 py-2 font-medium">Falhas</th>
                  <th className="text-right px-4 py-2 font-medium">Acao</th>
                </tr>
              </thead>
              <tbody>
                {queueEntries.map(([name, q]) => (
                  <tr key={name} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2 font-medium text-gray-800">{name}</td>
                    <td className="text-right px-3 py-2 font-mono">
                      <span className={q.wait > 100 ? 'text-amber-600 font-bold' : 'text-gray-600'}>{formatNumber(q.wait)}</span>
                    </td>
                    <td className="text-right px-3 py-2 font-mono text-blue-600">{formatNumber(q.active)}</td>
                    <td className="text-right px-3 py-2 font-mono text-gray-500">{formatNumber(q.delayed)}</td>
                    <td className="text-right px-3 py-2 font-mono text-emerald-600">{formatNumber(q.completed)}</td>
                    <td className="text-right px-3 py-2 font-mono">
                      <span className={q.failed > 0 ? 'text-red-600 font-bold' : 'text-gray-400'}>{formatNumber(q.failed)}</span>
                    </td>
                    <td className="text-right px-4 py-2">
                      <button
                        onClick={() => handleAction('drain_queue', name)}
                        disabled={actionLoading === `drain_queue:${name}`}
                        className="text-[10px] py-0.5 px-2 bg-gray-100 hover:bg-amber-100 text-gray-500 hover:text-amber-700 rounded transition-colors disabled:opacity-50"
                      >
                        Limpar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ─── 4. VPS Metrics Section ──────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Metricas VPS</h2>
        {vps ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* RAM Chart */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">RAM (24h)</h3>
              <div className="bg-gray-50 rounded-lg p-1 mb-3">
                <MiniLineChart
                  data={getVpsChartData('ram_used')}
                  lines={[{ key: 'value', color: '#3b82f6', fill: true }]}
                  height={120}
                />
              </div>
              <GaugeBar label="RAM Usada" value={ramUsedGb} max={ramTotalGb} unit="GB" />
            </div>

            {/* CPU Chart */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">CPU Load (24h)</h3>
              <div className="bg-gray-50 rounded-lg p-1 mb-3">
                <MiniLineChart
                  data={getVpsChartData('cpu_load')}
                  lines={[{ key: 'value', color: '#8b5cf6', fill: true }]}
                  height={120}
                />
              </div>
              <div className="space-y-2">
                <GaugeBar
                  label="Load 1min"
                  value={vps.cpu_load[0] ?? 0}
                  max={8}
                  unit=""
                  color={cpuLoad > 8 ? 'bg-red-500' : cpuLoad > 4 ? 'bg-amber-500' : 'bg-purple-500'}
                />
                {vps.cpu_load.length >= 3 && (
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>5min: <span className="font-mono text-gray-700">{vps.cpu_load[1]?.toFixed(2)}</span></span>
                    <span>15min: <span className="font-mono text-gray-700">{vps.cpu_load[2]?.toFixed(2)}</span></span>
                  </div>
                )}
              </div>
            </div>

            {/* Disk */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 md:col-span-2">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Disco</h3>
              <GaugeBar
                label="Uso de Disco"
                value={vps.disk_used_pct}
                max={100}
                unit="%"
                color={vps.disk_used_pct > 90 ? 'bg-red-500' : vps.disk_used_pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}
              />
              {vps.uptime_hours > 0 && (
                <p className="text-xs text-gray-400 mt-2">
                  Uptime VPS: {Math.floor(vps.uptime_hours / 24)}d {Math.floor(vps.uptime_hours % 24)}h
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-gray-400 text-sm">VPS nao acessivel — metricas indisponiveis</p>
          </div>
        )}
      </section>

      {/* ─── 5. Database Section ─────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Banco de Dados</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 font-medium text-xs">Tabela</th>
                <th className="text-right px-4 py-2.5 font-medium text-xs">Registros</th>
                <th className="text-right px-4 py-2.5 font-medium text-xs">Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(database).map(([table, count]) => (
                <tr key={table} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{table}</td>
                  <td className="text-right px-4 py-2.5 font-mono text-gray-700">{formatNumber(count)}</td>
                  <td className="text-right px-4 py-2.5">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-xs text-gray-400">ok</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
