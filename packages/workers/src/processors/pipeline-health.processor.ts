/**
 * 🏥 Autonomous Pipeline Health Supervisor
 *
 * Self-healing system that runs every 5 minutes in continuous loop.
 * Detects problems, applies escalating recovery strategies, and never stops
 * until the pipeline is healthy.
 *
 * Recovery escalation ladder:
 *   Level 1: Re-queue stuck/failed jobs
 *   Level 2: Flush and rebuild queues
 *   Level 3: Restart workers via PM2
 *   Level 4: Alert admin via Telegram
 *
 * Inspired by Kubernetes liveness/readiness probes + circuit breaker patterns.
 */
import { Worker, Queue, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { mapCacheQueue } from '../queues/map-cache.queue'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// ─── Configuration ───────────────────────────────────────────────────────────
const MAP_CACHE_STALE_MS = 2 * 60 * 60 * 1000    // 2 hours
const QUEUE_STUCK_THRESHOLD = 1000                 // jobs waiting = stuck
const MAX_FAILED_BEFORE_CLEAN = 50                 // clean failed jobs above this
const FAILED_JOB_MAX_AGE_MS = 12 * 60 * 60 * 1000 // 12 hours

// Track consecutive failures per check for escalation
const failureTracker = new Map<string, number>()

// All monitored queues
const QUEUE_CONFIG = [
  { name: 'scraping', critical: true, maxWaiting: 500 },
  { name: 'extraction', critical: true, maxWaiting: 2000 },
  { name: 'matching', critical: true, maxWaiting: 5000 },
  { name: 'ai-triage', critical: false, maxWaiting: 10000 },
  { name: 'semantic-matching', critical: false, maxWaiting: 50000 },
  { name: 'notification', critical: true, maxWaiting: 200 },
  { name: 'notification-whatsapp', critical: true, maxWaiting: 200 },
  { name: 'pending-notifications', critical: true, maxWaiting: 10 },
  { name: 'hot-alerts', critical: true, maxWaiting: 10 },
  { name: 'competition-analysis', critical: false, maxWaiting: 50 },
  { name: 'results-scraping', critical: false, maxWaiting: 500 },
  { name: 'fornecedor-enrichment', critical: false, maxWaiting: 50 },
  { name: 'map-cache', critical: true, maxWaiting: 5 },
  { name: 'pipeline-health', critical: false, maxWaiting: 5 },
  { name: 'comprasgov-scraping', critical: false, maxWaiting: 50 },
  { name: 'comprasgov-arp', critical: false, maxWaiting: 20 },
  { name: 'comprasgov-legado', critical: false, maxWaiting: 20 },
] as const

// ─── Recovery Actions ────────────────────────────────────────────────────────

/** Level 1: Clean failed jobs and re-queue them */
async function cleanAndRetryFailed(queueName: string): Promise<number> {
  const q = new Queue(queueName, { connection })
  const failedCount = await q.getFailedCount()
  if (failedCount <= MAX_FAILED_BEFORE_CLEAN) return 0

  const failedJobs = await q.getFailed(0, 200)
  let cleaned = 0
  let retried = 0

  for (const job of failedJobs) {
    const age = Date.now() - (job.finishedOn || 0)
    if (age > FAILED_JOB_MAX_AGE_MS) {
      await job.remove()
      cleaned++
    } else if (job.attemptsMade < (job.opts?.attempts || 3)) {
      await job.retry()
      retried++
    }
  }

  if (cleaned > 0 || retried > 0) {
    logger.info({ queueName, cleaned, retried }, '🔧 Level 1: Cleaned and retried failed jobs')
  }
  return cleaned + retried
}

/** Level 1: Move stalled/stuck active jobs back to waiting */
async function recoverStalledJobs(queueName: string): Promise<number> {
  const q = new Queue(queueName, { connection })
  const activeCount = await q.getActiveCount()

  // If active count is suspiciously high and waiting is also high, something is stuck
  if (activeCount > 10) {
    const activeJobs = await q.getActive(0, 50)
    let recovered = 0

    for (const job of activeJobs) {
      const processingTime = Date.now() - (job.processedOn || Date.now())
      // If a job has been "active" for > 30 minutes, it's likely stalled
      if (processingTime > 30 * 60 * 1000) {
        try {
          await job.moveToFailed(new Error('Recovered by health supervisor: stalled too long'), 'health-supervisor')
          await job.retry()
          recovered++
        } catch {
          // Job may have already completed
        }
      }
    }

    if (recovered > 0) {
      logger.info({ queueName, recovered }, '🔧 Level 1: Recovered stalled jobs')
    }
    return recovered
  }
  return 0
}

/** Level 2: Restart a specific PM2 worker */
async function restartWorker(workerName: string): Promise<boolean> {
  try {
    await execAsync(`pm2 restart ${workerName}`)
    logger.warn({ workerName }, '⚡ Level 3: Restarted PM2 worker')
    return true
  } catch (err) {
    logger.error({ workerName, err }, 'Failed to restart worker via PM2')
    return false
  }
}

/** Level 4: Alert admin via Telegram */
async function alertAdmin(message: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  // Get admin user telegram chat ID
  const { data: admins } = await supabase
    .from('users')
    .select('telegram_chat_id')
    .eq('is_platform_admin', true)
    .not('telegram_chat_id', 'is', null)

  if (!admins || admins.length === 0 || !botToken) {
    logger.warn({ message }, 'Cannot send admin alert — no admin Telegram configured')
    return
  }

  for (const admin of admins) {
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: admin.telegram_chat_id,
          text: `🚨 <b>Licitagram System Alert</b>\n\n${message}`,
          parse_mode: 'HTML',
        }),
      })
    } catch {
      // Best effort
    }
  }
  logger.warn({ message }, '🚨 Level 4: Admin alert sent')
}

/** Track failure count for escalation */
function trackFailure(checkName: string): number {
  const count = (failureTracker.get(checkName) || 0) + 1
  failureTracker.set(checkName, count)
  return count
}

function clearFailure(checkName: string): void {
  failureTracker.delete(checkName)
}

// ─── Health Checks ───────────────────────────────────────────────────────────

async function checkQueueHealth(): Promise<{ issues: string[]; fixes: string[] }> {
  const issues: string[] = []
  const fixes: string[] = []
  const queueStats: Record<string, { waiting: number; active: number; failed: number }> = {}

  for (const cfg of QUEUE_CONFIG) {
    try {
      const q = new Queue(cfg.name, { connection })
      const waiting = await q.getWaitingCount()
      const active = await q.getActiveCount()
      const failed = await q.getFailedCount()
      queueStats[cfg.name] = { waiting, active, failed }

      // Check for excessive failed jobs
      if (failed > MAX_FAILED_BEFORE_CLEAN) {
        const recovered = await cleanAndRetryFailed(cfg.name)
        if (recovered > 0) fixes.push(`${cfg.name}: cleaned/retried ${recovered} failed jobs`)
      }

      // Check for stalled active jobs
      if (active > 10) {
        const recovered = await recoverStalledJobs(cfg.name)
        if (recovered > 0) fixes.push(`${cfg.name}: recovered ${recovered} stalled jobs`)
      }

      // Track if queue is stuck (critical queues only)
      if (cfg.critical && waiting > cfg.maxWaiting && active === 0) {
        const failCount = trackFailure(`queue-stuck-${cfg.name}`)
        issues.push(`${cfg.name}: ${waiting} waiting, 0 active (stuck, attempt #${failCount})`)

        // Escalate based on failure count
        if (failCount >= 6) {
          // Level 4: Alert admin
          await alertAdmin(`Queue "${cfg.name}" has been stuck for 30+ minutes with ${waiting} waiting jobs and 0 active processors.`)
          clearFailure(`queue-stuck-${cfg.name}`)
        } else if (failCount >= 3) {
          // Level 3: Restart worker
          const workerMap: Record<string, string> = {
            'scraping': 'worker-scraping',
            'extraction': 'worker-extraction',
            'matching': 'worker-matching',
            'notification': 'worker-telegram',
            'notification-whatsapp': 'worker-whatsapp',
            'pending-notifications': 'worker-alerts',
            'hot-alerts': 'worker-alerts',
            'map-cache': 'worker-alerts',
          }
          const workerName = workerMap[cfg.name]
          if (workerName) {
            await restartWorker(workerName)
            fixes.push(`${cfg.name}: restarted ${workerName} (Level 3 escalation)`)
          }
        }
      } else {
        clearFailure(`queue-stuck-${cfg.name}`)
      }
    } catch {
      // Queue might not exist
    }
  }

  return { issues, fixes }
}

async function checkMapCacheFreshness(): Promise<{ issue?: string; fix?: string }> {
  const { data: latest } = await supabase
    .from('map_cache')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)

  const lastUpdate = latest?.[0]?.created_at
  const age = lastUpdate ? Date.now() - new Date(lastUpdate).getTime() : Infinity

  if (age > MAP_CACHE_STALE_MS) {
    const failCount = trackFailure('map-cache-stale')

    if (failCount >= 3) {
      // Try restarting the worker that runs map cache
      await restartWorker('worker-alerts')
      clearFailure('map-cache-stale')
      return {
        issue: `Map cache stale (${Math.round(age / 60000)}min) — restarted worker`,
        fix: 'Restarted worker-alerts (Level 3)',
      }
    }

    // Level 1: Just trigger a refresh
    await mapCacheQueue.add('health-refresh', {}, {
      jobId: `health-map-${Date.now()}`,
    })
    return {
      issue: `Map cache stale (${Math.round(age / 60000)}min)`,
      fix: 'Triggered map cache refresh',
    }
  }

  clearFailure('map-cache-stale')
  return {}
}

async function checkPipelineFlow(): Promise<{ issues: string[]; fixes: string[] }> {
  const issues: string[] = []
  const fixes: string[] = []

  // Check if new tenders are being scraped (should have tenders from today)
  const today = new Date().toISOString().split('T')[0]
  const { count: todayTenders } = await supabase
    .from('tenders')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', `${today}T00:00:00`)

  if (!todayTenders || todayTenders === 0) {
    const hour = new Date().getUTCHours()
    // Only alert if it's past 10 AM UTC (7 AM BRT) — scrapers should have run by then
    if (hour >= 10) {
      const failCount = trackFailure('no-tenders-today')
      issues.push(`No tenders scraped today (${hour}h UTC)`)

      if (failCount >= 3) {
        await restartWorker('worker-scraping')
        fixes.push('Restarted worker-scraping (no tenders today)')
        clearFailure('no-tenders-today')
      }
    }
  } else {
    clearFailure('no-tenders-today')
  }

  // Check if matches are being created today
  const { count: todayMatches } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', `${today}T00:00:00`)

  if (todayTenders && todayTenders > 100 && (!todayMatches || todayMatches === 0)) {
    const failCount = trackFailure('no-matches-today')
    issues.push(`${todayTenders} tenders today but 0 matches`)

    if (failCount >= 3) {
      await restartWorker('worker-matching')
      fixes.push('Restarted worker-matching (no matches despite tenders)')
      clearFailure('no-matches-today')
    }
  } else {
    clearFailure('no-matches-today')
  }

  // Check if notifications are flowing
  const { count: pendingNotifs } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'new')
    .is('notified_at', null)
    .in('match_source', ['ai', 'ai_triage', 'semantic'])
    .gte('score', 50)

  // If pending > 5000 and growing, notification pipeline might be stuck
  if (pendingNotifs && pendingNotifs > 5000) {
    const failCount = trackFailure('notifications-backlog')
    issues.push(`${pendingNotifs} pending notifications (backlog)`)

    if (failCount >= 6) {
      await alertAdmin(`Notification backlog: ${pendingNotifs} matches pending. Pipeline may be stuck.`)
      clearFailure('notifications-backlog')
    } else if (failCount >= 3) {
      await restartWorker('worker-alerts')
      await restartWorker('worker-telegram')
      fixes.push('Restarted alerts + telegram workers (notification backlog)')
    }
  } else {
    clearFailure('notifications-backlog')
  }

  return { issues, fixes }
}

async function checkRedisConnectivity(): Promise<{ ok: boolean; latencyMs?: number }> {
  const start = Date.now()
  try {
    const IORedis = (await import('ioredis')).default
    const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      lazyConnect: true,
      ...(process.env.REDIS_URL?.startsWith('rediss') ? { tls: {} } : {}),
    })
    await redis.connect()
    await redis.ping()
    const latency = Date.now() - start
    await redis.quit()
    clearFailure('redis-down')
    return { ok: true, latencyMs: latency }
  } catch {
    const failCount = trackFailure('redis-down')
    if (failCount >= 3) {
      await alertAdmin('Redis is unreachable! All queue processing is halted.')
    }
    return { ok: false }
  }
}

async function checkSupabaseConnectivity(): Promise<{ ok: boolean; latencyMs?: number }> {
  const start = Date.now()
  try {
    const { error } = await supabase.from('users').select('id').limit(1)
    const latency = Date.now() - start
    if (error) throw error
    clearFailure('supabase-down')
    return { ok: true, latencyMs: latency }
  } catch {
    const failCount = trackFailure('supabase-down')
    if (failCount >= 3) {
      await alertAdmin('Supabase is unreachable! Database operations are failing.')
    }
    return { ok: false }
  }
}

// ─── Main Health Check ───────────────────────────────────────────────────────

export const pipelineHealthWorker = new Worker(
  'pipeline-health',
  async () => {
    const startTime = Date.now()
    const allIssues: string[] = []
    const allFixes: string[] = []

    // 1. Infrastructure connectivity
    const [redis, supabaseHealth] = await Promise.all([
      checkRedisConnectivity(),
      checkSupabaseConnectivity(),
    ])

    if (!redis.ok) allIssues.push('Redis unreachable')
    if (!supabaseHealth.ok) allIssues.push('Supabase unreachable')

    // If infra is down, skip detailed checks
    if (!redis.ok || !supabaseHealth.ok) {
      logger.error({
        redis: redis.ok ? `OK (${redis.latencyMs}ms)` : 'DOWN',
        supabase: supabaseHealth.ok ? `OK (${supabaseHealth.latencyMs}ms)` : 'DOWN',
        issues: allIssues,
      }, '🚨 Pipeline health: INFRASTRUCTURE DOWN')
      return
    }

    // 2. Queue health
    const queueResult = await checkQueueHealth()
    allIssues.push(...queueResult.issues)
    allFixes.push(...queueResult.fixes)

    // 3. Map cache freshness
    const mapResult = await checkMapCacheFreshness()
    if (mapResult.issue) allIssues.push(mapResult.issue)
    if (mapResult.fix) allFixes.push(mapResult.fix)

    // 4. Pipeline flow
    const flowResult = await checkPipelineFlow()
    allIssues.push(...flowResult.issues)
    allFixes.push(...flowResult.fixes)

    // 5. Get summary stats
    const { count: totalTenders } = await supabase.from('tenders').select('*', { count: 'exact', head: true })
    const { count: totalMatches } = await supabase.from('matches').select('*', { count: 'exact', head: true })
    const { count: mapCacheCount } = await supabase.from('map_cache').select('*', { count: 'exact', head: true })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    const status = allIssues.length === 0 ? 'HEALTHY' : `${allIssues.length} ISSUES`

    logger.info({
      status,
      infra: {
        redis: `${redis.latencyMs}ms`,
        supabase: `${supabaseHealth.latencyMs}ms`,
      },
      pipeline: {
        tenders: totalTenders,
        matches: totalMatches,
        mapCache: mapCacheCount,
      },
      issues: allIssues.length > 0 ? allIssues : ['none'],
      fixes: allFixes.length > 0 ? allFixes : ['none needed'],
      activeEscalations: Object.fromEntries(failureTracker),
      elapsedSeconds: elapsed,
    }, `🏥 Pipeline health: ${status}`)
  },
  {
    connection,
    concurrency: 1,
  },
)

pipelineHealthWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Pipeline health check failed')
})
