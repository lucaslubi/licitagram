export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUserWithPlan } from '@/lib/auth-helpers'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
)

const VPS_MONITORING_URL = process.env.VPS_MONITORING_URL || 'http://85.31.60.53:3998'
const MONITORING_AUTH_TOKEN = process.env.MONITORING_AUTH_TOKEN || ''

// ─── Types ──────────────────────────────────────────────────────────────────

interface VpsWorker {
  name: string
  pid: number
  memory: number
  cpu: number
  uptime: string
  restarts: number
  status: string
}

interface QueueStats {
  wait: number
  active: number
  delayed: number
  completed: number
  failed: number
}

interface VpsMetrics {
  ram_total: number
  ram_used: number
  ram_free: number
  cpu_load: number[]
  cpu_count?: number
  disk_total_gb?: number
  disk_used_gb?: number
  disk_used_pct: number
  uptime_hours: number
  // API may return _mb suffixed fields
  [key: string]: unknown
}

interface VpsResponse {
  workers: VpsWorker[]
  queues: Record<string, QueueStats>
  vps: VpsMetrics
  timestamp: string
}

// ─── VPS data fetcher ───────────────────────────────────────────────────────

async function fetchVpsData(): Promise<VpsResponse | null> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (MONITORING_AUTH_TOKEN) {
      headers['Authorization'] = `Bearer ${MONITORING_AUTH_TOKEN}`
    }

    const res = await fetch(`${VPS_MONITORING_URL}/metrics`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      console.error(`VPS monitoring returned ${res.status}`)
      return null
    }

    return (await res.json()) as VpsResponse
  } catch (err) {
    console.error('Failed to fetch VPS monitoring data:', err)
    return null
  }
}

// ─── Database stats ─────────────────────────────────────────────────────────

async function fetchDatabaseStats() {
  const [
    { count: tenders },
    { count: companies },
    { count: matches },
    { count: competitors },
    { count: notifications },
    { count: botSessions },
    { count: certidaoJobs },
    { count: users },
    { count: subscriptions },
  ] = await Promise.all([
    supabase.from('tenders').select('*', { count: 'exact', head: true }),
    supabase.from('companies').select('*', { count: 'exact', head: true }),
    supabase.from('matches').select('*', { count: 'exact', head: true }),
    supabase.from('competitors').select('*', { count: 'exact', head: true }),
    supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .not('notified_at', 'is', null),
    supabase.from('bot_sessions').select('*', { count: 'exact', head: true }),
    supabase.from('certidao_jobs').select('*', { count: 'exact', head: true }),
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .in('status', ['active', 'trialing']),
  ])

  return {
    tenders: tenders || 0,
    companies: companies || 0,
    matches: matches || 0,
    competitors: competitors || 0,
    notifications: notifications || 0,
    bot_sessions: botSessions || 0,
    certidao_jobs: certidaoJobs || 0,
    users: users || 0,
    active_subscriptions: subscriptions || 0,
  }
}

// ─── Alerts generator ───────────────────────────────────────────────────────

interface Alert {
  level: 'critical' | 'warning' | 'info'
  message: string
  detail?: string
}

function generateAlerts(
  vps: VpsResponse | null,
  _dbStats: Record<string, number>,
): Alert[] {
  const alerts: Alert[] = []

  if (!vps) {
    alerts.push({
      level: 'critical',
      message: 'VPS monitoring endpoint unreachable',
      detail: `Could not connect to ${VPS_MONITORING_URL}. Monitoring server may be down.`,
    })
    return alerts
  }

  // Worker health
  const stoppedWorkers = vps.workers.filter(w => w.status !== 'online')
  if (stoppedWorkers.length > 0) {
    alerts.push({
      level: 'critical',
      message: `${stoppedWorkers.length} worker(s) offline: ${stoppedWorkers.map(w => w.name).join(', ')}`,
    })
  }

  const highRestartWorkers = vps.workers.filter(w => w.restarts > 10)
  if (highRestartWorkers.length > 0) {
    alerts.push({
      level: 'warning',
      message: `Workers com muitos restarts: ${highRestartWorkers.map(w => `${w.name}(${w.restarts})`).join(', ')}`,
    })
  }

  // Memory
  const ramUsedPct = vps.vps.ram_total > 0
    ? Math.round((vps.vps.ram_used / vps.vps.ram_total) * 100)
    : 0
  if (ramUsedPct > 90) {
    alerts.push({
      level: 'critical',
      message: `RAM usage at ${ramUsedPct}% (${vps.vps.ram_used}MB / ${vps.vps.ram_total}MB)`,
    })
  } else if (ramUsedPct > 75) {
    alerts.push({
      level: 'warning',
      message: `RAM usage at ${ramUsedPct}% (${vps.vps.ram_used}MB / ${vps.vps.ram_total}MB)`,
    })
  }

  // Disk
  if (vps.vps.disk_used_pct > 90) {
    alerts.push({
      level: 'critical',
      message: `Disk usage at ${vps.vps.disk_used_pct}%`,
    })
  } else if (vps.vps.disk_used_pct > 75) {
    alerts.push({
      level: 'warning',
      message: `Disk usage at ${vps.vps.disk_used_pct}%`,
    })
  }

  // CPU load (1-min average vs 4 vCPUs on VPS)
  const VPS_CPU_COUNT = 4
  if (vps.vps.cpu_load[0] > VPS_CPU_COUNT * 2) {
    alerts.push({
      level: 'critical',
      message: `CPU load very high: ${vps.vps.cpu_load[0]} (${VPS_CPU_COUNT} cores)`,
    })
  } else if (vps.vps.cpu_load[0] > VPS_CPU_COUNT) {
    alerts.push({
      level: 'warning',
      message: `CPU load elevated: ${vps.vps.cpu_load[0]} (${VPS_CPU_COUNT} cores)`,
    })
  }

  // Queue backlogs
  for (const [queueName, stats] of Object.entries(vps.queues)) {
    if (stats.wait > 5000) {
      alerts.push({
        level: 'critical',
        message: `Queue "${queueName}" has ${stats.wait} waiting jobs`,
      })
    } else if (stats.wait > 1000) {
      alerts.push({
        level: 'warning',
        message: `Queue "${queueName}" has ${stats.wait} waiting jobs`,
      })
    }

    if (stats.failed > 100) {
      alerts.push({
        level: 'warning',
        message: `Queue "${queueName}" has ${stats.failed} failed jobs`,
      })
    }
  }

  return alerts
}

// ─── GET handler ────────────────────────────────────────────────────────────

export async function GET() {
  // Auth check — admin only
  const user = await getUserWithPlan()
  if (!user || !user.isPlatformAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch VPS and database stats in parallel
    const [vpsData, dbStats] = await Promise.all([
      fetchVpsData(),
      fetchDatabaseStats(),
    ])

    const alerts = generateAlerts(vpsData, dbStats)

    // Normalize VPS metrics field names (API returns ram_total_mb, frontend expects ram_total)
    const vpsNormalized = vpsData?.vps ? {
      ram_total: vpsData.vps.ram_total_mb ?? vpsData.vps.ram_total ?? 0,
      ram_used: vpsData.vps.ram_used_mb ?? vpsData.vps.ram_used ?? 0,
      ram_free: vpsData.vps.ram_free_mb ?? vpsData.vps.ram_free ?? 0,
      cpu_load: vpsData.vps.cpu_load || [],
      cpu_count: vpsData.vps.cpu_count || 0,
      disk_total_gb: vpsData.vps.disk_total_gb || 0,
      disk_used_gb: vpsData.vps.disk_used_gb || 0,
      disk_used_pct: vpsData.vps.disk_used_pct || 0,
      uptime_hours: vpsData.vps.uptime_hours || 0,
    } as VpsMetrics : null

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      vps_reachable: vpsData !== null,
      workers: vpsData?.workers || [],
      queues: vpsData?.queues || {},
      vps: vpsNormalized,
      database: dbStats,
      alerts,
    })
  } catch (err) {
    console.error('Monitoring endpoint failed:', err)
    return NextResponse.json(
      { error: 'Failed to fetch monitoring data', detail: String(err) },
      { status: 500 },
    )
  }
}
