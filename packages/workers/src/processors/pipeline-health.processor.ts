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
import { db as supabase } from '../lib/db'
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

// All monitored queues — EVERY queue in the system
const QUEUE_CONFIG = [
  // Core pipeline (critical)
  { name: 'scraping', critical: true, maxWaiting: 500 },
  { name: 'extraction', critical: true, maxWaiting: 2000 },
  { name: 'matching', critical: true, maxWaiting: 5000 },
  { name: 'notification', critical: true, maxWaiting: 200 },
  { name: 'notification-whatsapp', critical: true, maxWaiting: 200 },
  { name: 'pending-notifications', critical: true, maxWaiting: 10 },
  { name: 'hot-alerts', critical: true, maxWaiting: 10 },
  { name: 'map-cache', critical: true, maxWaiting: 5 },
  // AI / matching
  { name: 'ai-triage', critical: false, maxWaiting: 10000 },
  { name: 'semantic-matching', critical: false, maxWaiting: 50000 },
  // Enrichment & intelligence
  { name: 'competition-analysis', critical: false, maxWaiting: 50 },
  { name: 'results-scraping', critical: false, maxWaiting: 500 },
  { name: 'fornecedor-enrichment', critical: false, maxWaiting: 50 },
  { name: 'contact-enrichment', critical: false, maxWaiting: 50 },
  { name: 'document-expiry', critical: false, maxWaiting: 5 },
  { name: 'proactive-supplier-scraping', critical: false, maxWaiting: 100 },
  { name: 'ai-competitor-classifier', critical: false, maxWaiting: 50 },
  { name: 'competitor-relevance', critical: false, maxWaiting: 20 },
  // Outcome tracking
  { name: 'outcome-prompt', critical: false, maxWaiting: 50 },
  // Scraping variants
  { name: 'comprasgov-scraping', critical: false, maxWaiting: 50 },
  { name: 'comprasgov-arp', critical: false, maxWaiting: 20 },
  { name: 'comprasgov-legado', critical: false, maxWaiting: 20 },
  // Self + audit
  { name: 'pipeline-health', critical: false, maxWaiting: 5 },
  { name: 'daily-audit', critical: false, maxWaiting: 5 },
] as const

// Complete mapping: queue name → PM2 process name (for auto-restart)
const WORKER_MAP: Record<string, string> = {
  'scraping': 'worker-scraping',
  'comprasgov-scraping': 'worker-scraping',
  'comprasgov-arp': 'worker-scraping',
  'comprasgov-legado': 'worker-scraping',
  'extraction': 'worker-extraction',
  'matching': 'worker-matching',
  'ai-triage': 'worker-matching',
  'semantic-matching': 'worker-matching',
  'notification': 'worker-telegram',
  'notification-whatsapp': 'worker-whatsapp',
  'pending-notifications': 'worker-alerts',
  'hot-alerts': 'worker-alerts',
  'map-cache': 'worker-alerts',
  'pipeline-health': 'worker-alerts',
  'outcome-prompt': 'worker-alerts',
  'competition-analysis': 'worker-enrichment',
  'results-scraping': 'worker-enrichment',
  'fornecedor-enrichment': 'worker-enrichment',
  'contact-enrichment': 'worker-enrichment',
  'document-expiry': 'worker-enrichment',
  'proactive-supplier-scraping': 'worker-enrichment',
  'ai-competitor-classifier': 'worker-enrichment',
  'competitor-relevance': 'worker-enrichment',
  'daily-audit': 'worker-alerts',
}

// All PM2 processes we expect to be running
const EXPECTED_PM2_PROCESSES = [
  'worker-scraping',
  'worker-extraction',
  'worker-matching',
  'worker-alerts',
  'worker-telegram',
  'worker-whatsapp',
  'queue-metrics',
  'worker-enrichment',
]

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

/** Level 2: Restart or Boot a specific PM2 worker */
async function restartWorker(workerName: string, isMissing = false): Promise<boolean> {
  try {
    if (isMissing) {
      // If it's completely missing, restart fails. We must start from ecosystem.
      await execAsync(`pm2 start ecosystem.config.js --only ${workerName}`)
      logger.warn({ workerName }, '⚡ Level 3: Booted missing PM2 worker from ecosystem.config.js')
    } else {
      await execAsync(`pm2 restart ${workerName}`)
      logger.warn({ workerName }, '⚡ Level 3: Restarted PM2 worker')
    }
    // Always save PM2 state to ensure resilience across server reboots
    await execAsync('pm2 save')
    return true
  } catch (err) {
    logger.error({ workerName, err }, 'Failed to (re)start worker via PM2')
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
          // Level 3: Restart worker via centralized WORKER_MAP
          const workerName = WORKER_MAP[cfg.name]
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
    // ... flow checks above ...
  } else {
    clearFailure('no-matches-today')
  }

  // Check if notifications are flowing and HEAL them
  const { count: pendingNotifs } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'new')
    .is('notified_at', null)
    .in('match_source', ['ai', 'ai_triage', 'semantic'])
    .gte('score', 50)

  // If pending > 100, the notification pipeline might be stuck
  if (pendingNotifs && pendingNotifs > 100) {
    const failCount = trackFailure('notifications-backlog')
    issues.push(`${pendingNotifs} pending notifications (backlog)`)

    if (failCount >= 6) {
      await alertAdmin(`Notification backlog: ${pendingNotifs} matches pending. Pipeline may be stuck.`)
      clearFailure('notifications-backlog')
    } else if (failCount >= 3) {
      await restartWorker('worker-alerts')
      await restartWorker('worker-telegram')
      fixes.push('Restarted alerts + telegram workers (notification backlog)')
      
      // AUTO-HEALING: Push stuck notifications to the queue directly!
      const { data: stuckMatches } = await supabase
         .from('matches')
         .select('id')
         .eq('status', 'new')
         .is('notified_at', null)
         .in('match_source', ['ai', 'ai_triage', 'semantic'])
         .gte('score', 50)
         .limit(1000)
         
      if (stuckMatches && stuckMatches.length > 0) {
         const q = new Queue('pending-notifications', { connection })
         await q.addBulk(stuckMatches.map((m: any) => ({
            name: 'process-notification',
            data: { matchId: m.id },
            opts: { removeOnComplete: true }
         })))
         fixes.push(`Auto-Healed: Queued ${stuckMatches.length} stuck notifications`)
      }
    }
  } else {
    clearFailure('notifications-backlog')
  }

  // AUTO-HEALING: Tenders stuck in "new" (Failed to extract)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: stuckTenders } = await supabase
    .from('tenders')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new')
    .lte('created_at', oneHourAgo)

  if (stuckTenders && stuckTenders > 10) {
     issues.push(`${stuckTenders} tenders stuck in 'new'`)
     const failCount = trackFailure('tenders-stuck')
     
     if (failCount >= 2) {
       // Auto-Heal: Re-queue to extraction
       const { data: stuckRows } = await supabase
         .from('tenders')
         .select('id, data_source, raw_content, source_url')
         .eq('status', 'new')
         .lte('created_at', oneHourAgo)
         .limit(500)
         
       if (stuckRows && stuckRows.length > 0) {
         const extractionQueue = new Queue('extraction', { connection })
         await extractionQueue.addBulk(stuckRows.map((r: any) => ({
           name: 'extract-tender',
           data: { 
             tenderId: r.id, 
             source: r.data_source, 
             rawText: r.raw_content, 
             url: r.source_url 
           },
           opts: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
         })))
         fixes.push(`Auto-Healed: Re-queued ${stuckRows.length} stuck tenders to extraction`)
       }
       clearFailure('tenders-stuck')
     }
  } else {
     clearFailure('tenders-stuck')
  }

  // AUTO-HEALING: Keyword-only matches missing AI Triage
  const { count: keywordMatches } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('match_source', 'keyword')

  if (keywordMatches && keywordMatches > 1000) {
     issues.push(`${keywordMatches} keyword-only matches bypassing AI`)
     const failCount = trackFailure('keyword-only-matches')
     
     if (failCount >= 3) {
       // Auto-Heal: Push to AI Triage queue
       const { data: aiMatches } = await supabase
         .from('matches')
         .select('id')
         .eq('match_source', 'keyword')
         .limit(500)
         
       if (aiMatches && aiMatches.length > 0) {
         const triageQueue = new Queue('ai-triage', { connection })
         await triageQueue.addBulk(aiMatches.map((m: any) => ({
           name: 'triage-match',
           data: { matchId: m.id },
           opts: { removeOnComplete: true }
         })))
         fixes.push(`Auto-Healed: Queued ${aiMatches.length} keyword matches to AI Triage`)
       }
       clearFailure('keyword-only-matches')
     }
  } else {
     clearFailure('keyword-only-matches')
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

// ─── PM2 Process Health ─────────────────────────────────────────────────────

async function checkPM2Processes(): Promise<{ issues: string[]; fixes: string[] }> {
  const issues: string[] = []
  const fixes: string[] = []

  try {
    const { stdout } = await execAsync('pm2 jlist')
    const processes = JSON.parse(stdout) as Array<{
      name: string
      pm2_env: { status: string; restart_time: number; pm_uptime: number }
    }>

    for (const expectedName of EXPECTED_PM2_PROCESSES) {
      const proc = processes.find(p => p.name === expectedName)

      if (!proc) {
        issues.push(`PM2 process "${expectedName}" not found`)
        const failCount = trackFailure(`pm2-missing-${expectedName}`)
        if (failCount >= 2) {
          await restartWorker(expectedName, true)
          fixes.push(`Started missing process ${expectedName}`)
          clearFailure(`pm2-missing-${expectedName}`)
        }
        continue
      }

      const status = proc.pm2_env.status
      if (status !== 'online') {
        issues.push(`PM2 "${expectedName}" status: ${status}`)
        const failCount = trackFailure(`pm2-down-${expectedName}`)
        // Immediately restart if stopped/errored
        if (failCount >= 1) {
          await restartWorker(expectedName)
          fixes.push(`Restarted ${expectedName} (was ${status})`)
          clearFailure(`pm2-down-${expectedName}`)
        }
        continue
      }

      // Check for crash loops: >20 restarts and uptime < 5 minutes
      const uptime = Date.now() - proc.pm2_env.pm_uptime
      const restarts = proc.pm2_env.restart_time
      if (restarts > 20 && uptime < 5 * 60 * 1000) {
        issues.push(`PM2 "${expectedName}" crash loop: ${restarts} restarts, uptime ${Math.round(uptime / 1000)}s`)
        const failCount = trackFailure(`pm2-crashloop-${expectedName}`)
        if (failCount >= 3) {
          await alertAdmin(`Worker "${expectedName}" is in a crash loop: ${restarts} restarts in ${Math.round(uptime / 60000)}min. Manual intervention required.`)
          clearFailure(`pm2-crashloop-${expectedName}`)
        }
      } else {
        clearFailure(`pm2-down-${expectedName}`)
        clearFailure(`pm2-missing-${expectedName}`)
        clearFailure(`pm2-crashloop-${expectedName}`)
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Could not check PM2 processes (may not be running under PM2)')
  }

  return { issues, fixes }
}

// ─── Enrichment Pipeline Health ─────────────────────────────────────────────

async function checkEnrichmentPipeline(): Promise<{ issues: string[]; fixes: string[] }> {
  const issues: string[] = []
  const fixes: string[] = []

  try {
    // Check if competitor_stats is being refreshed (should be < 6h old)
    const { data: latestStat } = await supabase
      .from('competitor_stats')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)

    if (latestStat?.[0]?.updated_at) {
      const age = Date.now() - new Date(latestStat[0].updated_at).getTime()
      const ageHours = age / (60 * 60 * 1000)

      if (ageHours > 6) {
        const failCount = trackFailure('competitor-stats-stale')
        issues.push(`competitor_stats stale (${ageHours.toFixed(1)}h old)`)

        if (failCount >= 2) {
          // Trigger competition-analysis manually
          const competitionQueue = new Queue('competition-analysis', { connection })
          await competitionQueue.add('health-trigger', {}, { jobId: `health-comp-${Date.now()}` })
          fixes.push('Triggered competition-analysis refresh')
          clearFailure('competitor-stats-stale')
        }
      } else {
        clearFailure('competitor-stats-stale')
      }
    }

    // Check if AI classifier is working (unclassified competitors)
    const { count: unclassified } = await supabase
      .from('competitor_stats')
      .select('*', { count: 'exact', head: true })
      .is('segmento_ia', null)

    const { count: totalStats } = await supabase
      .from('competitor_stats')
      .select('*', { count: 'exact', head: true })

    if (totalStats && unclassified && totalStats > 10) {
      const classifiedPct = Math.round(((totalStats - unclassified) / totalStats) * 100)
      if (classifiedPct < 30 && totalStats > 50) {
        const failCount = trackFailure('ai-classifier-slow')
        issues.push(`AI classifier: only ${classifiedPct}% classified (${unclassified} pending)`)

        if (failCount >= 3) {
          // Trigger AI classifier manually
          const classifierQueue = new Queue('ai-competitor-classifier', { connection })
          await classifierQueue.add('health-trigger', {}, { jobId: `health-ai-${Date.now()}` })
          fixes.push('Triggered AI competitor classifier')
          clearFailure('ai-classifier-slow')
        }
      } else {
        clearFailure('ai-classifier-slow')
      }
    }

    // Check proactive supplier scraping is producing results
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: recentCompetitors } = await supabase
      .from('competitors')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneDayAgo)

    if (!recentCompetitors || recentCompetitors === 0) {
      const hour = new Date().getUTCHours()
      if (hour >= 12) {
        const failCount = trackFailure('no-competitors-today')
        issues.push('No new competitors scraped in 24h')

        if (failCount >= 2) {
          await restartWorker('worker-enrichment')
          fixes.push('Restarted worker-enrichment (no competitors in 24h)')
          clearFailure('no-competitors-today')
        }
      }
    } else {
      clearFailure('no-competitors-today')
    }
  } catch (err) {
    logger.warn({ err }, 'Error checking enrichment pipeline health')
  }

  return { issues, fixes }
}

// ─── WhatsApp / WAHA Connectivity Health ──────────────────────────────────────

async function checkWhatsAppConnectivity(): Promise<{ issues: string[]; fixes: string[] }> {
  const issues: string[] = []
  const fixes: string[] = []

  try {
    const wahaUrl = process.env.WAHA_URL || process.env.EVOLUTION_API_URL || 'http://127.0.0.1:3000'
    const wahaKey = process.env.WAHA_API_KEY || process.env.EVOLUTION_API_KEY || ''
    const wahaSession = process.env.WAHA_SESSION || 'default'

    // 1. Check if WAHA is reachable and session is WORKING
    const res = await fetch(`${wahaUrl}/api/sessions/${wahaSession}`, {
      headers: { 'X-Api-Key': wahaKey },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      const failCount = trackFailure('waha-unreachable')
      issues.push(`WAHA API returned ${res.status} at ${wahaUrl}`)

      if (failCount >= 6) {
        await alertAdmin(`⚠️ WhatsApp WAHA está inacessível (${wahaUrl}). Status HTTP ${res.status}. Notificações WhatsApp NÃO estão sendo enviadas!`)
        clearFailure('waha-unreachable')
      }
    } else {
      const data = await res.json() as { status?: string }
      if (data.status !== 'WORKING') {
        const failCount = trackFailure('waha-disconnected')
        issues.push(`WAHA session "${wahaSession}" status: ${data.status} (not WORKING)`)

        if (failCount >= 3) {
          await alertAdmin(`⚠️ WhatsApp WAHA sessão "${wahaSession}" status: ${data.status}. Precisa escanear QR code novamente.`)
          clearFailure('waha-disconnected')
        }
      } else {
        clearFailure('waha-unreachable')
        clearFailure('waha-disconnected')
      }
    }

    // 2. Check for permanently failed WhatsApp jobs (max retries exhausted) and clean them
    const waQueue = new Queue('notification-whatsapp', { connection })
    const failedCount = await waQueue.getFailedCount()
    if (failedCount > 20) {
      const failedJobs = await waQueue.getFailed(0, 300)
      let cleaned = 0
      for (const job of failedJobs) {
        // Clean permanently failed jobs (all retries exhausted) or jobs > 6h old
        const isMaxed = job.attemptsMade >= (job.opts?.attempts || 5)
        const age = Date.now() - (job.finishedOn || 0)
        if (isMaxed || age > 6 * 60 * 60 * 1000) {
          await job.remove()
          cleaned++
        }
      }
      if (cleaned > 0) {
        fixes.push(`Cleaned ${cleaned} permanently failed WhatsApp jobs (unblocking re-enqueue)`)
        logger.info({ cleaned }, '🧹 Cleaned permanently failed WhatsApp jobs')
      }
    }

    // Same for Telegram
    const tgQueue = new Queue('notification', { connection })
    const tgFailedCount = await tgQueue.getFailedCount()
    if (tgFailedCount > 20) {
      const failedJobs = await tgQueue.getFailed(0, 300)
      let cleaned = 0
      for (const job of failedJobs) {
        const isMaxed = job.attemptsMade >= (job.opts?.attempts || 3)
        const age = Date.now() - (job.finishedOn || 0)
        if (isMaxed || age > 6 * 60 * 60 * 1000) {
          await job.remove()
          cleaned++
        }
      }
      if (cleaned > 0) {
        fixes.push(`Cleaned ${cleaned} permanently failed Telegram jobs`)
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Error checking WhatsApp connectivity')
  }

  return { issues, fixes }
}

// ─── Expired Matches Purge ─────────────────────────────────────────────────

async function purgeExpiredMatches(): Promise<{ issues: string[]; fixes: string[] }> {
  const issues: string[] = []
  const fixes: string[] = []

  try {
    const today = new Date().toISOString().split('T')[0]

    // Count matches that are 'new' + unnotified but their tender has expired
    // This prevents expired matches from occupying query limits
    const { data: expiredMatches } = await supabase
      .from('matches')
      .select('id, tenders!inner(data_encerramento)')
      .eq('status', 'new')
      .is('notified_at', null)
      .lt('tenders.data_encerramento', today)
      .limit(500)

    if (expiredMatches && expiredMatches.length > 50) {
      const ids = expiredMatches.map((m: any) => m.id)
      const { error } = await supabase
        .from('matches')
        .update({ status: 'expired' })
        .in('id', ids)

      if (!error) {
        fixes.push(`Marked ${ids.length} expired-tender matches as 'expired'`)
        logger.info({ count: ids.length }, '🧹 Auto-purged expired matches')
      } else {
        logger.warn({ error: error.message, count: ids.length }, 'Failed to purge expired matches')
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Error purging expired matches')
  }

  return { issues, fixes }
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

    // 5. PM2 process status (are all workers running?)
    const pm2Result = await checkPM2Processes()
    allIssues.push(...pm2Result.issues)
    allFixes.push(...pm2Result.fixes)

    // 6. Enrichment pipeline (competitor_stats, AI classifier, supplier scraping)
    const enrichResult = await checkEnrichmentPipeline()
    allIssues.push(...enrichResult.issues)
    allFixes.push(...enrichResult.fixes)

    // 7. WhatsApp/WAHA connectivity + permanently failed job cleanup
    const waResult = await checkWhatsAppConnectivity()
    allIssues.push(...waResult.issues)
    allFixes.push(...waResult.fixes)

    // 8. Expired matches purge (prevents expired tenders from filling query LIMIT)
    const expiredResult = await purgeExpiredMatches()
    allIssues.push(...expiredResult.issues)
    allFixes.push(...expiredResult.fixes)

    // 9. Get summary stats
    const [
      { count: totalTenders },
      { count: totalMatches },
      { count: mapCacheCount },
      { count: totalCompetitors },
      { count: totalCompetitorStats },
    ] = await Promise.all([
      supabase.from('tenders').select('*', { count: 'exact', head: true }),
      supabase.from('matches').select('*', { count: 'exact', head: true }),
      supabase.from('map_cache').select('*', { count: 'exact', head: true }),
      supabase.from('competitors').select('*', { count: 'exact', head: true }),
      supabase.from('competitor_stats').select('*', { count: 'exact', head: true }),
    ])

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
        competitors: totalCompetitors,
        competitorStats: totalCompetitorStats,
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
    lockDuration: 600_000,
    stalledInterval: 600_000,
  },
)

pipelineHealthWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Pipeline health check failed')
})
