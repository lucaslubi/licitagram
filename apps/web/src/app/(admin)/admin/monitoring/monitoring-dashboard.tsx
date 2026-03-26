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
 * SPARKLINE HISTORY TYPES
 * ════════════════════════════════════════════════════════════════════════════ */

const SPARKLINE_MAX_POINTS = 60 // 5 minutes at 5s intervals

interface SparklinePoint {
  memory: number
  cpu: number
}

interface QueueSparklinePoint {
  waiting: number
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
  if (status === 'online') return 'bg-emerald-900/20 text-emerald-400 border-emerald-800'
  if (status === 'errored' || status === 'error') return 'bg-red-900/20 text-red-400 border-red-800'
  if (status === 'stopped') return 'bg-[#2d2f33] text-gray-400 border-[#2d2f33]'
  return 'bg-yellow-900/20 text-yellow-400 border-yellow-800'
}

function mbToGb(mb: number): number {
  return mb / 1024
}

/* ════════════════════════════════════════════════════════════════════════════
 * ECG STYLES — injected once via useEffect
 * ════════════════════════════════════════════════════════════════════════════ */

const ECG_STYLE_ID = 'ecg-sparkline-styles'

function useEcgStyles() {
  useEffect(() => {
    if (document.getElementById(ECG_STYLE_ID)) return
    const style = document.createElement('style')
    style.id = ECG_STYLE_ID
    style.textContent = [
      '@keyframes ecg-glow-green { 0%, 100% { filter: drop-shadow(0 0 2px #00ff8844); } 50% { filter: drop-shadow(0 0 6px #00ff88aa); } }',
      '@keyframes ecg-glow-cyan { 0%, 100% { filter: drop-shadow(0 0 2px #00ccff44); } 50% { filter: drop-shadow(0 0 6px #00ccffaa); } }',
      '@keyframes ecg-glow-orange { 0%, 100% { filter: drop-shadow(0 0 2px #ff990044); } 50% { filter: drop-shadow(0 0 6px #ff9900aa); } }',
      '@keyframes ecg-scanline { 0% { opacity: 0.03; } 50% { opacity: 0.06; } 100% { opacity: 0.03; } }',
    ].join('\n')
    document.head.appendChild(style)
    return () => { style.remove() }
  }, [])
}

/* ════════════════════════════════════════════════════════════════════════════
 * ECG SPARKLINE COMPONENT — hospital monitor style
 * ════════════════════════════════════════════════════════════════════════════ */

function EcgSparkline({
  data,
  lines,
  width = 200,
  height = 40,
}: {
  data: number[][]  // array of arrays, one per line
  lines: Array<{ color: string; label: string; glowAnim: string }>
  width?: number
  height?: number
}) {
  const pad = { top: 4, right: 28, bottom: 4, left: 24 }
  const cW = width - pad.left - pad.right
  const cH = height - pad.top - pad.bottom

  // Find global max across all lines
  let gMax = 1
  for (const lineData of data) {
    for (const v of lineData) {
      if (v > gMax) gMax = v
    }
  }

  const toX = (i: number, total: number) => {
    if (total <= 1) return pad.left
    return pad.left + (i / (total - 1)) * cW
  }
  const toY = (v: number) => pad.top + cH - (v / gMax) * cH

  // Grid lines (horizontal dotted)
  const gridLines = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="relative rounded overflow-hidden" style={{ background: '#0a0a0f' }}>
      {/* Scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.02) 2px, rgba(255,255,255,0.02) 4px)',
          animation: 'ecg-scanline 4s ease-in-out infinite',
          zIndex: 2,
        }}
      />
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height, display: 'block' }}
      >
        {/* Grid lines */}
        {gridLines.map((f) => (
          <line
            key={f}
            x1={pad.left}
            x2={width - pad.right}
            y1={pad.top + cH * (1 - f)}
            y2={pad.top + cH * (1 - f)}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={0.5}
            strokeDasharray="2,3"
          />
        ))}

        {/* Lines */}
        {data.map((lineData, lineIdx) => {
          if (lineData.length < 2) return null
          const line = lines[lineIdx]
          const pts = lineData.map((v, i) => `${toX(i, lineData.length)},${toY(v)}`).join(' ')
          const lastVal = lineData[lineData.length - 1]
          const isHigh = lastVal > gMax * 0.75

          // Area fill polygon
          const areaPoints = `${toX(0, lineData.length)},${toY(0)} ${pts} ${toX(lineData.length - 1, lineData.length)},${toY(0)}`

          return (
            <g key={lineIdx} style={isHigh ? { animation: `${line.glowAnim} 1s ease-in-out infinite` } : undefined}>
              {/* Area fill */}
              <polygon
                points={areaPoints}
                fill={line.color}
                fillOpacity={0.08}
              />
              {/* Main line */}
              <polyline
                points={pts}
                fill="none"
                stroke={line.color}
                strokeWidth={1.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  filter: isHigh ? `drop-shadow(0 0 4px ${line.color})` : `drop-shadow(0 0 1px ${line.color}55)`,
                }}
              />
              {/* Current value dot */}
              <circle
                cx={toX(lineData.length - 1, lineData.length)}
                cy={toY(lastVal)}
                r={1.5}
                fill={line.color}
                style={{
                  filter: `drop-shadow(0 0 3px ${line.color})`,
                }}
              />
              {/* Current value text on the right */}
              <text
                x={width - pad.right + 3}
                y={toY(lastVal) + 3}
                fontSize={7}
                fill={line.color}
                fontFamily="monospace"
                opacity={0.9}
              >
                {lastVal > 0 ? (lastVal >= 100 ? lastVal.toFixed(0) : lastVal.toFixed(1)) : '\u2014'}
              </text>
            </g>
          )
        })}

        {/* Labels in corners */}
        {lines.map((line, i) => (
          <text
            key={`label-${i}`}
            x={pad.left + 1}
            y={pad.top + 7 + i * 10}
            fontSize={6}
            fill={line.color}
            fontFamily="monospace"
            fontWeight="bold"
            opacity={0.7}
          >
            {line.label}
          </text>
        ))}
      </svg>
    </div>
  )
}

/* Queue sparkline — single line, orange */
function QueueEcgSparkline({ data, width = 200, height = 32 }: {
  data: number[]
  width?: number
  height?: number
}) {
  const pad = { top: 3, right: 24, bottom: 3, left: 20 }
  const cW = width - pad.left - pad.right
  const cH = height - pad.top - pad.bottom

  let gMax = 1
  for (const v of data) {
    if (v > gMax) gMax = v
  }

  const toX = (i: number) => {
    if (data.length <= 1) return pad.left
    return pad.left + (i / (data.length - 1)) * cW
  }
  const toY = (v: number) => pad.top + cH - (v / gMax) * cH

  if (data.length < 2) {
    return (
      <div className="rounded overflow-hidden flex items-center justify-center" style={{ background: '#0a0a0f', height }}>
        <span style={{ color: '#ff990066', fontSize: 8, fontFamily: 'monospace' }}>Sem dados</span>
      </div>
    )
  }

  const pts = data.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
  const areaPoints = `${toX(0)},${toY(0)} ${pts} ${toX(data.length - 1)},${toY(0)}`
  const lastVal = data[data.length - 1]
  const isHigh = lastVal > gMax * 0.75

  return (
    <div className="relative rounded overflow-hidden" style={{ background: '#0a0a0f' }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.02) 2px, rgba(255,255,255,0.02) 4px)',
          zIndex: 2,
        }}
      />
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height, display: 'block' }}>
        {/* Grid */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={pad.left}
            x2={width - pad.right}
            y1={pad.top + cH * (1 - f)}
            y2={pad.top + cH * (1 - f)}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={0.5}
            strokeDasharray="2,3"
          />
        ))}
        {/* Area */}
        <polygon points={areaPoints} fill="#ff9900" fillOpacity={0.08} />
        {/* Line */}
        <polyline
          points={pts}
          fill="none"
          stroke="#ff9900"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            filter: isHigh ? 'drop-shadow(0 0 4px #ff9900)' : 'drop-shadow(0 0 1px #ff990055)',
            animation: isHigh ? 'ecg-glow-orange 1s ease-in-out infinite' : undefined,
          }}
        />
        {/* Dot */}
        <circle
          cx={toX(data.length - 1)}
          cy={toY(lastVal)}
          r={1.5}
          fill="#ff9900"
          style={{ filter: 'drop-shadow(0 0 3px #ff9900)' }}
        />
        {/* Label */}
        <text x={pad.left + 1} y={pad.top + 6} fontSize={5.5} fill="#ff9900" fontFamily="monospace" fontWeight="bold" opacity={0.7}>
          FILA
        </text>
        {/* Value */}
        <text x={width - pad.right + 2} y={toY(lastVal) + 3} fontSize={6.5} fill="#ff9900" fontFamily="monospace" opacity={0.9}>
          {formatNumber(lastVal)}
        </text>
      </svg>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * MINI CHART COMPONENTS (pure CSS/SVG — no recharts dependency)
 * ════════════════════════════════════════════════════════════════════════════ */

function MiniBar({ value, max, color = 'bg-blue-500' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="h-1.5 w-full bg-[#2d2f33] rounded-full overflow-hidden">
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
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300 font-mono">
          {typeof value === 'number' ? value.toFixed(1) : value} / {typeof max === 'number' ? max.toFixed(1) : max}{' '}
          {unit || ''}
          <span className="text-gray-400 ml-1">({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="h-2.5 bg-[#2d2f33] rounded-full overflow-hidden">
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
  return <div className={`animate-pulse bg-[#2d2f33] rounded ${className}`} />
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 max-w-7xl">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[#23262a] rounded-xl p-5 border border-[#2d2f33]">
            <Skeleton className="h-4 w-24 mb-3" />
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-[#23262a] rounded-xl p-4 border border-[#2d2f33]">
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
  const borderColor = status === 'ok' ? 'border-emerald-800' : status === 'warning' ? 'border-amber-800' : 'border-red-800'
  const dotColor = status === 'ok' ? 'bg-emerald-500' : status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
  const iconColor = status === 'ok' ? 'text-emerald-600' : status === 'warning' ? 'text-amber-400' : 'text-red-400'

  return (
    <div className={`bg-[#23262a] rounded-xl border ${borderColor} p-4 sm:p-5`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-xs font-medium uppercase tracking-wide">{title}</span>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {status === 'ok' && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-75`} />}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dotColor}`} />
          </span>
          <span className={iconColor}>{icon}</span>
        </div>
      </div>
      <p className="text-xl sm:text-2xl font-bold text-white font-mono">{value}</p>
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

  // ─── Inject ECG CSS keyframes ─────────────────────────────────────
  useEcgStyles()

  // ─── Sparkline history (last 60 data points = 5 min at 5s intervals) ──
  const [workerSparkHistory, setWorkerSparkHistory] = useState<Record<string, SparklinePoint[]>>({})
  const [queueSparkHistory, setQueueSparkHistory] = useState<Record<string, QueueSparklinePoint[]>>({})

  // ─── Fetch live data ─────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/monitoring', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setLastRefresh(new Date())
      setError(null)

      // Append sparkline data points
      const monData = json as MonitoringData

      // Worker sparklines
      setWorkerSparkHistory((prev) => {
        const next = { ...prev }
        for (const w of monData.workers) {
          const arr = next[w.name] ? [...next[w.name]] : []
          arr.push({ memory: w.memory, cpu: w.cpu })
          if (arr.length > SPARKLINE_MAX_POINTS) arr.shift()
          next[w.name] = arr
        }
        return next
      })

      // Queue sparklines
      setQueueSparkHistory((prev) => {
        const next = { ...prev }
        for (const [qName, qStats] of Object.entries(monData.queues)) {
          const arr = next[qName] ? [...next[qName]] : []
          arr.push({ waiting: qStats.wait })
          if (arr.length > SPARKLINE_MAX_POINTS) arr.shift()
          next[qName] = arr
        }
        return next
      })
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
      <div className="bg-red-900/20 border border-red-800 rounded-xl p-6 text-center max-w-lg mx-auto mt-12">
        <p className="text-red-400 mb-3">Erro ao carregar monitoramento</p>
        <p className="text-red-400 text-sm mb-4">{error}</p>
        <button onClick={fetchData} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
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
          <h1 className="text-2xl font-bold text-white">Monitoramento</h1>
          <p className="text-gray-400 text-sm">
            Tempo real &middot; Atualiza a cada 5s
            {lastRefresh && (
              <span className="ml-2 text-gray-400">
                Última atualização: {timeAgo(lastRefresh)}
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
            className="px-4 py-2 bg-[#23262a] hover:bg-[#2d2f33] text-gray-300 rounded-lg text-sm border border-[#2d2f33] disabled:opacity-50 shadow-sm transition-colors"
          >
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      {/* ─── Alerts ─────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.filter((a) => a.level === 'critical').map((a, i) => (
            <div key={`c-${i}`} className="bg-red-900/20 border border-red-800 rounded-lg p-3 flex items-start gap-2">
              <span className="text-red-500 mt-0.5 shrink-0">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" /></svg>
              </span>
              <div>
                <p className="text-red-400 text-sm font-medium">{a.message}</p>
                {a.detail && <p className="text-red-400 text-xs mt-0.5">{a.detail}</p>}
              </div>
            </div>
          ))}
          {alerts.filter((a) => a.level === 'warning').map((a, i) => (
            <div key={`w-${i}`} className="bg-amber-900/20 border border-amber-800 rounded-lg p-3 flex items-start gap-2">
              <span className="text-amber-500 mt-0.5 shrink-0">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
              </span>
              <div>
                <p className="text-amber-400 text-sm font-medium">{a.message}</p>
                {a.detail && <p className="text-amber-400 text-xs mt-0.5">{a.detail}</p>}
              </div>
            </div>
          ))}
          {alerts.filter((a) => a.level === 'info').map((a, i) => (
            <div key={`i-${i}`} className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 flex items-start gap-2">
              <span className="text-blue-500 mt-0.5 shrink-0">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" /></svg>
              </span>
              <p className="text-blue-400 text-sm">{a.message}</p>
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
          value={cpuLoad > 0 ? cpuLoad.toFixed(2) : '\u2014'}
          status={cpuLoad > 8 ? 'error' : cpuLoad > 4 ? 'warning' : 'ok'}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
        />
      </div>

      {/* ─── 2. Workers Section ──────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Workers PM2</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {workers.map((w) => {
            const sparkData = workerSparkHistory[w.name] || []
            const memoryLine = sparkData.map((p) => p.memory)
            const cpuLine = sparkData.map((p) => p.cpu)

            return (
              <div key={w.name} className="bg-[#23262a] rounded-xl border border-[#2d2f33] p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      {w.status === 'online' && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${statusColor(w.status)} opacity-75`} />}
                      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${statusColor(w.status)}`} />
                    </span>
                    <span className="text-sm font-medium text-white truncate">{w.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {w.restarts > 5 && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-red-900/20 text-red-400 rounded-full font-mono">{w.restarts}x</span>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusBadgeClasses(w.status)}`}>{w.status}</span>
                  </div>
                </div>

                {/* ECG Sparkline Monitor */}
                <div className="mb-3">
                  <EcgSparkline
                    data={[memoryLine, cpuLine]}
                    lines={[
                      { color: '#00ff88', label: 'MEM', glowAnim: 'ecg-glow-green' },
                      { color: '#00ccff', label: 'CPU', glowAnim: 'ecg-glow-cyan' },
                    ]}
                    width={200}
                    height={40}
                  />
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between text-gray-400 mb-0.5">
                      <span>Memoria</span>
                      <span className="font-mono text-gray-300">{w.memory > 0 ? `${w.memory.toFixed(0)} MB` : '\u2014'}</span>
                    </div>
                    <MiniBar value={w.memory} max={512} color="bg-blue-500" />
                  </div>
                  <div>
                    <div className="flex justify-between text-gray-400 mb-0.5">
                      <span>CPU</span>
                      <span className="font-mono text-gray-300">{w.cpu > 0 ? `${w.cpu.toFixed(1)}%` : '\u2014'}</span>
                    </div>
                    <MiniBar value={w.cpu} max={100} color="bg-purple-500" />
                  </div>
                  <div className="flex justify-between text-gray-400 pt-1">
                    <span>Uptime</span>
                    <span className="font-mono text-gray-300">{w.uptime || '\u2014'}</span>
                  </div>
                  {w.pid > 0 && (
                    <div className="flex justify-between text-gray-400">
                      <span>PID</span>
                      <span className="font-mono text-gray-300">{w.pid}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-400">
                    <span>Restarts</span>
                    <span className={`font-mono ${w.restarts > 5 ? 'text-red-400 font-bold' : 'text-gray-300'}`}>{w.restarts}</span>
                  </div>
                </div>

                <button
                  onClick={() => handleAction('restart_worker', w.name)}
                  disabled={actionLoading === `restart_worker:${w.name}`}
                  className="mt-3 w-full text-xs py-1.5 px-3 bg-[#1a1c1f] hover:bg-red-900/20 text-gray-400 hover:text-red-400 rounded-lg border border-[#2d2f33] hover:border-red-800 transition-colors disabled:opacity-50"
                >
                  {actionLoading === `restart_worker:${w.name}` ? 'Reiniciando...' : 'Forcar Restart'}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* ─── 3. Queue Charts Section ─────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Filas (Ultimas 24h)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {chartQueues.map((qName) => {
            const queueData = queues[qName]
            const chartData = getQueueChartData(qName)
            const qSparkData = (queueSparkHistory[qName] || []).map((p) => p.waiting)

            return (
              <div key={qName} className="bg-[#23262a] rounded-xl border border-[#2d2f33] p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-white">{qName}</h3>
                  <button
                    onClick={() => handleAction('drain_queue', qName)}
                    disabled={actionLoading === `drain_queue:${qName}`}
                    className="text-[10px] py-1 px-2 bg-[#1a1c1f] hover:bg-amber-900/20 text-gray-400 hover:text-amber-400 rounded border border-[#2d2f33] hover:border-amber-800 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === `drain_queue:${qName}` ? '...' : 'Limpar Fila'}
                  </button>
                </div>

                {/* ECG Queue Sparkline — tempo real */}
                <div className="mb-2">
                  <QueueEcgSparkline data={qSparkData} width={200} height={32} />
                </div>

                <div className="bg-[#1a1c1f] rounded-lg p-1 mb-3">
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

                <div className="flex items-center gap-3 mb-2 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Aguardando</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Ativo</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Falhas</span>
                </div>

                {queueData && (
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-gray-400">Aguard.</p>
                      <p className="text-sm font-bold text-amber-400 font-mono">{formatNumber(queueData.wait)}</p>
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
                      <p className="text-sm font-bold text-red-400 font-mono">{formatNumber(queueData.failed)}</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* All queues table */}
        <div className="mt-4 bg-[#23262a] rounded-xl border border-[#2d2f33] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#2d2f33]">
            <h3 className="text-sm font-semibold text-white">Todas as Filas</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#1a1c1f] text-gray-400 border-b border-[#2d2f33]">
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
                  <tr key={name} className="border-b border-[#2d2f33] hover:bg-[#2d2f33]/50">
                    <td className="px-4 py-2 font-medium text-white">{name}</td>
                    <td className="text-right px-3 py-2 font-mono">
                      <span className={q.wait > 100 ? 'text-amber-400 font-bold' : 'text-gray-400'}>{formatNumber(q.wait)}</span>
                    </td>
                    <td className="text-right px-3 py-2 font-mono text-blue-600">{formatNumber(q.active)}</td>
                    <td className="text-right px-3 py-2 font-mono text-gray-400">{formatNumber(q.delayed)}</td>
                    <td className="text-right px-3 py-2 font-mono text-emerald-600">{formatNumber(q.completed)}</td>
                    <td className="text-right px-3 py-2 font-mono">
                      <span className={q.failed > 0 ? 'text-red-400 font-bold' : 'text-gray-400'}>{formatNumber(q.failed)}</span>
                    </td>
                    <td className="text-right px-4 py-2">
                      <button
                        onClick={() => handleAction('drain_queue', name)}
                        disabled={actionLoading === `drain_queue:${name}`}
                        className="text-[10px] py-0.5 px-2 bg-[#2d2f33] hover:bg-amber-900/20 text-gray-400 hover:text-amber-400 rounded transition-colors disabled:opacity-50"
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
        <h2 className="text-lg font-semibold text-white mb-3">Metricas VPS</h2>
        {vps ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* RAM Chart */}
            <div className="bg-[#23262a] rounded-xl border border-[#2d2f33] p-4">
              <h3 className="text-sm font-semibold text-white mb-2">RAM (24h)</h3>
              <div className="bg-[#1a1c1f] rounded-lg p-1 mb-3">
                <MiniLineChart
                  data={getVpsChartData('ram_used')}
                  lines={[{ key: 'value', color: '#3b82f6', fill: true }]}
                  height={120}
                />
              </div>
              <GaugeBar label="RAM Usada" value={ramUsedGb} max={ramTotalGb} unit="GB" />
            </div>

            {/* CPU Chart */}
            <div className="bg-[#23262a] rounded-xl border border-[#2d2f33] p-4">
              <h3 className="text-sm font-semibold text-white mb-2">CPU Load (24h)</h3>
              <div className="bg-[#1a1c1f] rounded-lg p-1 mb-3">
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
                  <div className="flex gap-4 text-xs text-gray-400">
                    <span>5min: <span className="font-mono text-gray-300">{vps.cpu_load[1]?.toFixed(2)}</span></span>
                    <span>15min: <span className="font-mono text-gray-300">{vps.cpu_load[2]?.toFixed(2)}</span></span>
                  </div>
                )}
              </div>
            </div>

            {/* Disk */}
            <div className="bg-[#23262a] rounded-xl border border-[#2d2f33] p-4 md:col-span-2">
              <h3 className="text-sm font-semibold text-white mb-3">Disco</h3>
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
          <div className="bg-[#1a1c1f] border border-[#2d2f33] rounded-xl p-6 text-center">
            <p className="text-gray-400 text-sm">VPS nao acessivel — metricas indisponiveis</p>
          </div>
        )}
      </section>

      {/* ─── 5. Database Section ─────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Banco de Dados</h2>
        <div className="bg-[#23262a] rounded-xl border border-[#2d2f33] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1a1c1f] text-gray-400 border-b border-[#2d2f33]">
                <th className="text-left px-4 py-2.5 font-medium text-xs">Tabela</th>
                <th className="text-right px-4 py-2.5 font-medium text-xs">Registros</th>
                <th className="text-right px-4 py-2.5 font-medium text-xs">Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(database).map(([table, count]) => (
                <tr key={table} className="border-b border-[#2d2f33] hover:bg-[#2d2f33]/50">
                  <td className="px-4 py-2.5 font-medium text-white">{table}</td>
                  <td className="text-right px-4 py-2.5 font-mono text-gray-300">{formatNumber(count)}</td>
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
