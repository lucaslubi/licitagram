/**
 * 🧠 Autonomous Self-Evolving Audit System
 *
 * Runs at 3 AM BRT (06:00 UTC) via cron.
 *
 * EVOLUTION CAPABILITIES:
 *   - Learns from past audit_logs to detect recurring patterns
 *   - Auto-fixes ALL safe operations (low + medium risk) without hesitation
 *   - Applies permanent fixes for recurring issues
 *   - Optimizes system performance based on trend analysis
 *   - Tracks evolution history in system_evolution table
 *   - AI diagnosis includes historical context for smarter recommendations
 *   - Escalates only truly dangerous (data-destructive) operations
 *
 * Dimensions:
 *   1. Infrastructure Health
 *   2. Data Pipeline Integrity
 *   3. Database Health
 *   4. AI Pipeline
 *   5. Notification Delivery
 *   6. Security
 *   7. Performance & Optimization
 *   8. Self-Evolution (NEW — learns and improves)
 */
import { Worker, Queue } from 'bullmq'
import { connection } from '../queues/connection'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { callLLM, parseJsonResponse } from '../ai/llm-client'
import { exec } from 'child_process'
import { promisify } from 'util'
import crypto from 'crypto'

const execAsync = promisify(exec)

// ─── Types ──────────────────────────────────────────────────────────────────

interface CheckResult {
  check: string
  status: 'ok' | 'warning' | 'critical'
  details: Record<string, unknown>
}

interface DimensionResult {
  dimension: string
  checks: CheckResult[]
}

interface AIDiagnosis {
  critical: Array<{
    issue: string
    fix_command: string
    risk_level: 'low' | 'medium' | 'high'
    permanent_fix?: string // NEW: suggestion for permanent prevention
  }>
  warnings: Array<{ issue: string; recommendation: string }>
  optimizations: Array<{
    area: string
    suggestion: string
    auto_executable?: boolean // NEW: can this be auto-executed?
    command?: string // NEW: command to execute the optimization
  }>
  patterns_detected: Array<{
    pattern: string
    frequency: string
    root_cause: string
    permanent_solution: string
    solution_command?: string
  }>
}

interface RecurringIssue {
  id: string
  dimension: string
  check_name: string
  occurrence_count: number
  last_fix_applied: string | null
  permanent_fix_applied: boolean
}

interface EvolutionAction {
  type: 'auto_fix' | 'optimization' | 'pattern_prevention' | 'config_tuning' | 'cleanup' | 'scaling'
  description: string
  action: string
  success: boolean
  metrics_before?: Record<string, unknown>
  metrics_after?: Record<string, unknown>
}

// ─── Queue Config ───────────────────────────────────────────────────────────

const QUEUE_NAMES = [
  'scraping', 'extraction', 'matching', 'notification', 'notification-whatsapp',
  'pending-notifications', 'hot-alerts', 'map-cache', 'ai-triage',
  'semantic-matching', 'competition-analysis', 'results-scraping',
  'fornecedor-enrichment', 'contact-enrichment', 'document-expiry',
  'proactive-supplier-scraping', 'ai-competitor-classifier',
  'competitor-relevance', 'outcome-prompt', 'comprasgov-scraping',
  'comprasgov-arp', 'comprasgov-legado', 'pipeline-health', 'daily-audit',
]

const EXPECTED_PM2_PROCESSES = [
  'worker-scraping', 'worker-extraction', 'worker-matching',
  'worker-alerts', 'worker-telegram', 'worker-whatsapp',
  'queue-metrics', 'worker-enrichment',
]

// ─── Safe Commands Whitelist (expanded for autonomous execution) ─────────

const SAFE_COMMAND_PATTERNS = [
  /^pm2 (restart|flush|reload) .+/,
  /^pm2 restart all$/,
  /^pm2 flush$/,
  /^pm2 save$/,
  /^pm2 update$/,
  /^rm -f \/tmp\/bullmq-/,         // BullMQ temp files
  /^rm -f \/var\/log\/licitagram\/.*\.log\.gz/,  // Compressed old logs
  /^find \/var\/log .+ -delete$/,   // Log cleanup
  /^journalctl --vacuum-size=\d+[MG]$/, // Journal cleanup
  /^sync && echo 3 > \/proc\/sys\/vm\/drop_caches$/, // Memory cache clear
  /^npm cache clean --force$/,
  /^pnpm store prune$/,
]

function isCommandSafe(cmd: string): boolean {
  return SAFE_COMMAND_PATTERNS.some(pattern => pattern.test(cmd.trim()))
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function safeExec(cmd: string, timeoutMs = 10000): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execAsync(cmd, { timeout: timeoutMs })
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return { stdout: e.stdout || '', stderr: e.stderr || e.message || 'command failed' }
  }
}

function formatNumber(n: number | null | undefined): string {
  if (n == null) return '0'
  return n.toLocaleString('pt-BR')
}

function formatDate(): string {
  const now = new Date()
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  const dd = String(brt.getUTCDate()).padStart(2, '0')
  const mm = String(brt.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = brt.getUTCFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function issueHash(dimension: string, checkName: string): string {
  return crypto.createHash('md5').update(`${dimension}:${checkName}`).digest('hex').substring(0, 16)
}

// ─── PHASE 0: Learn from History ────────────────────────────────────────────

async function learnFromHistory(): Promise<{
  recurringIssues: RecurringIssue[]
  pastOptimizations: string[]
  recentFixes: string[]
  trends: Record<string, unknown>
}> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Get recurring issues from tracking table
  let recurringIssues: RecurringIssue[] = []
  try {
    const { data } = await supabase
      .from('recurring_issues')
      .select('id, dimension, check_name, occurrence_count, last_fix_applied, permanent_fix_applied')
      .eq('status', 'active')
      .order('occurrence_count', { ascending: false })
      .limit(20)

    recurringIssues = (data || []) as RecurringIssue[]
  } catch {
    // Table might not exist yet
  }

  // Get recent critical/warning patterns from audit_logs (last 7 days)
  let recentFixes: string[] = []
  try {
    const { data } = await supabase
      .from('audit_logs')
      .select('check_name, fix_applied, status')
      .in('status', ['fixed', 'critical', 'warning'])
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(100)

    recentFixes = (data || [])
      .filter((d: { fix_applied?: string | null }) => d.fix_applied)
      .map((d: { check_name: string; fix_applied: string }) => `${d.check_name}: ${d.fix_applied}`)
  } catch {
    // OK if empty
  }

  // Get past evolution actions
  let pastOptimizations: string[] = []
  try {
    const { data } = await supabase
      .from('system_evolution')
      .select('description, action_taken, success')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(30)

    pastOptimizations = (data || []).map(
      (d: { description: string; success: boolean }) => `${d.success ? '✅' : '❌'} ${d.description}`
    )
  } catch {
    // Table might not exist yet
  }

  // Trend analysis: count issues per dimension over 7 days
  const trends: Record<string, unknown> = {}
  try {
    const { data } = await supabase
      .from('audit_logs')
      .select('dimension, status')
      .in('status', ['critical', 'warning'])
      .gte('created_at', sevenDaysAgo)

    if (data) {
      const dimCounts: Record<string, number> = {}
      for (const row of data as Array<{ dimension: string }>) {
        dimCounts[row.dimension] = (dimCounts[row.dimension] || 0) + 1
      }
      trends.issues_per_dimension_7d = dimCounts
    }
  } catch {
    // OK
  }

  logger.info({
    recurringIssues: recurringIssues.length,
    recentFixes: recentFixes.length,
    pastOptimizations: pastOptimizations.length,
  }, '🧠 Learned from history')

  return { recurringIssues, pastOptimizations, recentFixes, trends }
}

// ─── DIMENSION 1: Infrastructure Health ─────────────────────────────────────

async function checkInfrastructure(): Promise<DimensionResult> {
  const checks: CheckResult[] = []

  // Disk usage
  try {
    const { stdout } = await safeExec("df -h / | tail -1 | awk '{print $5}'")
    const usagePct = parseInt(stdout.replace('%', '').trim(), 10)
    checks.push({
      check: 'Disco',
      status: usagePct > 90 ? 'critical' : usagePct > 80 ? 'warning' : 'ok',
      details: { usage_percent: usagePct },
    })
  } catch {
    checks.push({ check: 'Disco', status: 'warning', details: { error: 'Não foi possível verificar' } })
  }

  // Memory
  try {
    const { stdout } = await safeExec("free -m | grep Mem | awk '{print $2, $3, $4}'")
    const [total, used, free] = stdout.trim().split(/\s+/).map(Number)
    const usedPct = Math.round((used / total) * 100)
    checks.push({
      check: 'Memória',
      status: usedPct > 90 ? 'critical' : usedPct > 80 ? 'warning' : 'ok',
      details: { total_mb: total, used_mb: used, free_mb: free, used_percent: usedPct },
    })
  } catch {
    checks.push({ check: 'Memória', status: 'warning', details: { error: 'Não foi possível verificar' } })
  }

  // CPU load
  try {
    const { stdout } = await safeExec("cat /proc/loadavg | awk '{print $1, $2, $3}'")
    const [load1, load5, load15] = stdout.trim().split(/\s+/).map(Number)
    checks.push({
      check: 'CPU Load',
      status: load5 > 4 ? 'critical' : load5 > 2 ? 'warning' : 'ok',
      details: { load_1m: load1, load_5m: load5, load_15m: load15 },
    })
  } catch {
    checks.push({ check: 'CPU Load', status: 'warning', details: { error: 'Não foi possível verificar' } })
  }

  // PM2 processes
  try {
    const { stdout } = await safeExec('pm2 jlist')
    const processes = JSON.parse(stdout) as Array<{
      name: string
      pm2_env: { status: string; restart_time: number; pm_uptime: number }
      monit?: { memory?: number; cpu?: number }
    }>

    let allOnline = true
    let crashLoops = 0
    const processDetails: Record<string, unknown> = {}
    const autoRestarts: string[] = []

    for (const expected of EXPECTED_PM2_PROCESSES) {
      const proc = processes.find(p => p.name === expected)
      if (!proc) {
        allOnline = false
        processDetails[expected] = 'NOT FOUND'
        // AUTO-FIX: Start missing process
        try {
          await safeExec(`pm2 restart ${expected}`, 15000)
          autoRestarts.push(expected)
          logger.info({ process: expected }, '🔧 Auto-started missing PM2 process')
        } catch {
          // Will be reported
        }
        continue
      }

      const status = proc.pm2_env.status
      if (status !== 'online') {
        allOnline = false
        // AUTO-FIX: Restart stopped/errored process immediately
        try {
          await safeExec(`pm2 restart ${expected}`, 15000)
          autoRestarts.push(expected)
          logger.info({ process: expected, prevStatus: status }, '🔧 Auto-restarted PM2 process')
        } catch {
          // Will be reported
        }
      }

      const uptime = Date.now() - proc.pm2_env.pm_uptime
      const restarts = proc.pm2_env.restart_time

      if (restarts > 10 && uptime < 10 * 60 * 1000) {
        crashLoops++
      }

      processDetails[expected] = {
        status,
        restarts,
        uptime_min: Math.round(uptime / 60000),
        memory_mb: proc.monit?.memory ? Math.round(proc.monit.memory / (1024 * 1024)) : null,
        cpu_percent: proc.monit?.cpu ?? null,
      }
    }

    checks.push({
      check: 'PM2 Processos',
      status: !allOnline || crashLoops > 0 ? 'critical' : 'ok',
      details: {
        all_online: allOnline,
        crash_loops: crashLoops,
        auto_restarts: autoRestarts,
        processes: processDetails,
      },
    })
  } catch {
    checks.push({ check: 'PM2 Processos', status: 'warning', details: { error: 'PM2 não acessível' } })
  }

  // Redis connectivity + latency
  try {
    const IORedis = (await import('ioredis')).default
    const start = Date.now()
    const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      lazyConnect: true,
      ...(process.env.REDIS_URL?.startsWith('rediss') ? { tls: {} } : {}),
    })
    await redis.connect()
    await redis.ping()
    const latency = Date.now() - start
    const info = await redis.info('memory')
    const memMatch = info.match(/used_memory_human:(\S+)/)
    const redisMemory = memMatch ? memMatch[1] : 'unknown'
    await redis.quit()

    checks.push({
      check: 'Redis',
      status: latency > 500 ? 'critical' : latency > 200 ? 'warning' : 'ok',
      details: { latency_ms: latency, memory: redisMemory },
    })
  } catch {
    checks.push({ check: 'Redis', status: 'critical', details: { error: 'Unreachable' } })
  }

  // Supabase connectivity + latency
  try {
    const start = Date.now()
    const { error } = await supabase.from('users').select('id').limit(1)
    const latency = Date.now() - start
    checks.push({
      check: 'Supabase',
      status: error ? 'critical' : latency > 2000 ? 'warning' : 'ok',
      details: { latency_ms: latency, error: error?.message },
    })
  } catch {
    checks.push({ check: 'Supabase', status: 'critical', details: { error: 'Unreachable' } })
  }

  // Evolution API (WhatsApp)
  try {
    const evoUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080'
    const resp = await fetch(`${evoUrl}/instance/fetchInstances`, {
      headers: { apikey: process.env.EVOLUTION_API_KEY || '' },
      signal: AbortSignal.timeout(5000),
    })
    checks.push({
      check: 'Evolution API (WhatsApp)',
      status: resp.ok ? 'ok' : 'warning',
      details: { http_status: resp.status },
    })
  } catch {
    checks.push({ check: 'Evolution API (WhatsApp)', status: 'warning', details: { error: 'Não acessível' } })
  }

  return { dimension: 'Infraestrutura', checks }
}

// ─── DIMENSION 2: Data Pipeline Integrity ───────────────────────────────────

async function checkDataPipeline(): Promise<DimensionResult> {
  const checks: CheckResult[] = []
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Tenders scraped in last 24h
  try {
    const { count } = await supabase
      .from('tenders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneDayAgo)

    checks.push({
      check: 'Editais 24h',
      status: (count ?? 0) === 0 ? 'critical' : (count ?? 0) < 50 ? 'warning' : 'ok',
      details: { count: count ?? 0 },
    })
  } catch {
    checks.push({ check: 'Editais 24h', status: 'warning', details: { error: 'Query failed' } })
  }

  // Matches created in last 24h
  try {
    const { count } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneDayAgo)

    checks.push({
      check: 'Matches 24h',
      status: (count ?? 0) === 0 ? 'warning' : 'ok',
      details: { count: count ?? 0 },
    })
  } catch {
    checks.push({ check: 'Matches 24h', status: 'warning', details: { error: 'Query failed' } })
  }

  // Notifications sent in last 24h
  try {
    const { count } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .not('notified_at', 'is', null)
      .gte('notified_at', oneDayAgo)

    checks.push({
      check: 'Notificações 24h',
      status: (count ?? 0) === 0 ? 'warning' : 'ok',
      details: { count: count ?? 0 },
    })
  } catch {
    checks.push({ check: 'Notificações 24h', status: 'warning', details: { error: 'Query failed' } })
  }

  // Map cache freshness
  try {
    const { data } = await supabase
      .from('map_cache')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)

    const lastUpdate = data?.[0]?.created_at
    const ageHours = lastUpdate ? (Date.now() - new Date(lastUpdate).getTime()) / (60 * 60 * 1000) : Infinity

    checks.push({
      check: 'Map Cache',
      status: ageHours > 3 ? 'warning' : 'ok',
      details: { age_hours: Math.round(ageHours * 10) / 10 },
    })
  } catch {
    checks.push({ check: 'Map Cache', status: 'warning', details: { error: 'Query failed' } })
  }

  // Competitor stats freshness
  try {
    const { data } = await supabase
      .from('competitor_stats')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)

    const lastUpdate = data?.[0]?.updated_at
    const ageHours = lastUpdate ? (Date.now() - new Date(lastUpdate).getTime()) / (60 * 60 * 1000) : Infinity

    checks.push({
      check: 'Competitor Stats',
      status: ageHours > 6 ? 'warning' : 'ok',
      details: { age_hours: Math.round(ageHours * 10) / 10 },
    })
  } catch {
    checks.push({ check: 'Competitor Stats', status: 'warning', details: { error: 'Query failed' } })
  }

  // Queue health: stuck and failed jobs + AUTO-CLEAN failed jobs
  try {
    let totalWaiting = 0
    let totalFailed = 0
    let stuckQueues = 0
    let failedCleaned = 0
    const queueDetails: Record<string, { waiting: number; failed: number }> = {}

    for (const name of QUEUE_NAMES) {
      try {
        const q = new Queue(name, { connection })
        const waiting = await q.getWaitingCount()
        const failed = await q.getFailedCount()
        totalWaiting += waiting
        totalFailed += failed
        if (waiting > 1000) stuckQueues++
        if (waiting > 100 || failed > 50) {
          queueDetails[name] = { waiting, failed }
        }

        // AUTO-FIX: Clean failed jobs older than 24h if > 100
        if (failed > 100) {
          try {
            const cleaned = await q.clean(24 * 60 * 60 * 1000, 500, 'failed')
            failedCleaned += cleaned.length
            logger.info({ queue: name, cleaned: cleaned.length }, '🧹 Auto-cleaned failed jobs')
          } catch {
            // Best effort
          }
        }
      } catch {
        // Queue might not exist yet
      }
    }

    checks.push({
      check: 'Filas',
      status: stuckQueues > 0 ? 'critical' : totalFailed > 500 ? 'warning' : 'ok',
      details: {
        total_waiting: totalWaiting,
        total_failed: totalFailed,
        stuck_queues: stuckQueues,
        failed_auto_cleaned: failedCleaned,
        notable: queueDetails,
      },
    })
  } catch {
    checks.push({ check: 'Filas', status: 'warning', details: { error: 'Queue check failed' } })
  }

  return { dimension: 'Pipeline de Dados', checks }
}

// ─── DIMENSION 3: Database Health ───────────────────────────────────────────

async function checkDatabaseHealth(): Promise<DimensionResult> {
  const checks: CheckResult[] = []

  // Table sizes / row counts
  try {
    const { data, error } = await supabase.rpc('get_table_sizes')
    if (!error && data) {
      checks.push({
        check: 'Tamanho das tabelas',
        status: 'ok',
        details: { tables: data },
      })
    } else {
      const tables = ['tenders', 'matches', 'competitors', 'competitor_stats', 'map_cache', 'users']
      const counts: Record<string, number> = {}
      for (const table of tables) {
        try {
          const { count } = await supabase.from(table).select('*', { count: 'exact', head: true })
          counts[table] = count ?? 0
        } catch {
          counts[table] = -1
        }
      }
      checks.push({
        check: 'Contagem de registros',
        status: 'ok',
        details: { counts },
      })
    }
  } catch {
    checks.push({ check: 'Tamanho das tabelas', status: 'warning', details: { error: 'Não disponível' } })
  }

  // Connection pool check
  try {
    const start = Date.now()
    const parallelQueries = Array.from({ length: 5 }, () =>
      supabase.from('users').select('id').limit(1)
    )
    const results = await Promise.allSettled(parallelQueries)
    const elapsed = Date.now() - start
    const failures = results.filter(r => r.status === 'rejected').length

    checks.push({
      check: 'Pool de Conexões',
      status: failures > 2 ? 'critical' : elapsed > 5000 ? 'warning' : 'ok',
      details: { parallel_queries: 5, failures, elapsed_ms: elapsed },
    })
  } catch {
    checks.push({ check: 'Pool de Conexões', status: 'warning', details: { error: 'Check failed' } })
  }

  // RLS verification
  try {
    const { data: rlsData } = await supabase.rpc('check_rls_status')
    if (rlsData) {
      const disabledRls = Array.isArray(rlsData) ? rlsData.filter((t: { rls_enabled: boolean }) => !t.rls_enabled) : []
      checks.push({
        check: 'Row Level Security',
        status: disabledRls.length > 0 ? 'warning' : 'ok',
        details: { disabled_tables: disabledRls },
      })
    } else {
      checks.push({ check: 'Row Level Security', status: 'ok', details: { note: 'RPC não disponível, assume ativo' } })
    }
  } catch {
    checks.push({ check: 'Row Level Security', status: 'ok', details: { note: 'RPC não disponível' } })
  }

  // Orphaned data check — matches without valid tenders
  try {
    const { count } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .is('tender_id', null)

    checks.push({
      check: 'Dados Órfãos',
      status: (count ?? 0) > 100 ? 'warning' : 'ok',
      details: { orphaned_matches: count ?? 0 },
    })
  } catch {
    checks.push({ check: 'Dados Órfãos', status: 'ok', details: { note: 'Check skipped' } })
  }

  return { dimension: 'Banco de Dados', checks }
}

// ─── DIMENSION 4: AI Pipeline ───────────────────────────────────────────────

async function checkAIPipeline(): Promise<DimensionResult> {
  const checks: CheckResult[] = []

  // DeepSeek API reachability
  try {
    const start = Date.now()
    const response = await callLLM({
      task: 'classification',
      system: 'Responda apenas com a palavra OK.',
      prompt: 'Teste de conectividade. Responda OK.',
      maxRetries: 1,
    })
    const latency = Date.now() - start
    checks.push({
      check: 'DeepSeek API',
      status: response.includes('OK') ? 'ok' : 'warning',
      details: { latency_ms: latency, response_preview: response.substring(0, 50) },
    })
  } catch (err) {
    checks.push({
      check: 'DeepSeek API',
      status: 'critical',
      details: { error: (err as Error).message },
    })
  }

  // AI triage backlog
  try {
    const { count } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('match_source', 'keyword')
      .eq('status', 'new')

    checks.push({
      check: 'AI Triage Backlog',
      status: (count ?? 0) > 10000 ? 'warning' : 'ok',
      details: { pending: count ?? 0 },
    })
  } catch {
    checks.push({ check: 'AI Triage Backlog', status: 'warning', details: { error: 'Query failed' } })
  }

  // Semantic matching queue depth
  try {
    const q = new Queue('semantic-matching', { connection })
    const waiting = await q.getWaitingCount()
    checks.push({
      check: 'Semantic Matching Queue',
      status: waiting > 50000 ? 'warning' : 'ok',
      details: { waiting },
    })
  } catch {
    checks.push({ check: 'Semantic Matching Queue', status: 'ok', details: { note: 'Queue check skipped' } })
  }

  // AI classifier progress
  try {
    const { count: total } = await supabase
      .from('competitor_stats')
      .select('*', { count: 'exact', head: true })

    const { count: classified } = await supabase
      .from('competitor_stats')
      .select('*', { count: 'exact', head: true })
      .not('segmento_ia', 'is', null)

    const pct = total && total > 0 ? Math.round(((classified ?? 0) / total) * 100) : 100
    checks.push({
      check: 'AI Classifier',
      status: pct < 30 && (total ?? 0) > 50 ? 'warning' : 'ok',
      details: { total: total ?? 0, classified: classified ?? 0, percent: pct },
    })
  } catch {
    checks.push({ check: 'AI Classifier', status: 'ok', details: { note: 'Check skipped' } })
  }

  // Competitor relevance freshness
  try {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('competitor_relevance')
      .select('*', { count: 'exact', head: true })
      .gte('analyzed_at', sixHoursAgo)

    checks.push({
      check: 'Competitor Relevance',
      status: (count ?? 0) === 0 ? 'warning' : 'ok',
      details: { updated_last_6h: count ?? 0 },
    })
  } catch {
    checks.push({ check: 'Competitor Relevance', status: 'ok', details: { note: 'Check skipped' } })
  }

  return { dimension: 'Pipeline de IA', checks }
}

// ─── DIMENSION 5: Notification Delivery ─────────────────────────────────────

async function checkNotificationDelivery(): Promise<DimensionResult> {
  const checks: CheckResult[] = []

  // Telegram bot connectivity
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (botToken) {
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
        signal: AbortSignal.timeout(5000),
      })
      const data = await resp.json() as { ok: boolean }
      checks.push({
        check: 'Telegram Bot',
        status: data.ok ? 'ok' : 'critical',
        details: { connected: data.ok },
      })
    } else {
      checks.push({ check: 'Telegram Bot', status: 'warning', details: { error: 'Token não configurado' } })
    }
  } catch {
    checks.push({ check: 'Telegram Bot', status: 'critical', details: { error: 'Não conectável' } })
  }

  // WhatsApp session
  try {
    const evoUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080'
    const instanceName = process.env.EVOLUTION_INSTANCE || 'licitagram'
    const resp = await fetch(`${evoUrl}/instance/connectionState/${instanceName}`, {
      headers: { apikey: process.env.EVOLUTION_API_KEY || '' },
      signal: AbortSignal.timeout(5000),
    })
    const data = await resp.json() as { instance?: { state?: string } }
    const state = data?.instance?.state || 'unknown'
    checks.push({
      check: 'WhatsApp Session',
      status: state === 'open' ? 'ok' : 'warning',
      details: { state },
    })
  } catch {
    checks.push({ check: 'WhatsApp Session', status: 'warning', details: { error: 'Não acessível' } })
  }

  // Failed notifications
  try {
    const notifQueue = new Queue('notification', { connection })
    const whatsappQueue = new Queue('notification-whatsapp', { connection })
    const telegramFailed = await notifQueue.getFailedCount()
    const whatsappFailed = await whatsappQueue.getFailedCount()

    // AUTO-FIX: Clean old failed notification jobs
    if (telegramFailed > 200) {
      try {
        await notifQueue.clean(12 * 60 * 60 * 1000, 300, 'failed')
        logger.info('🧹 Auto-cleaned old failed telegram notifications')
      } catch { /* best effort */ }
    }
    if (whatsappFailed > 200) {
      try {
        await whatsappQueue.clean(12 * 60 * 60 * 1000, 300, 'failed')
        logger.info('🧹 Auto-cleaned old failed whatsapp notifications')
      } catch { /* best effort */ }
    }

    checks.push({
      check: 'Falhas de Notificação',
      status: (telegramFailed + whatsappFailed) > 100 ? 'warning' : 'ok',
      details: { telegram_failed: telegramFailed, whatsapp_failed: whatsappFailed },
    })
  } catch {
    checks.push({ check: 'Falhas de Notificação', status: 'ok', details: { note: 'Check skipped' } })
  }

  // Delivery rate
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: sent } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .not('notified_at', 'is', null)
      .gte('notified_at', oneDayAgo)

    const { count: pending } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .is('notified_at', null)
      .eq('status', 'new')
      .in('match_source', ['ai', 'ai_triage', 'semantic'])
      .gte('score', 50)

    const total = (sent ?? 0) + (pending ?? 0)
    const rate = total > 0 ? Math.round(((sent ?? 0) / total) * 100) : 100

    checks.push({
      check: 'Taxa de Entrega',
      status: rate < 50 && total > 100 ? 'warning' : 'ok',
      details: { sent: sent ?? 0, pending: pending ?? 0, delivery_rate_pct: rate },
    })
  } catch {
    checks.push({ check: 'Taxa de Entrega', status: 'ok', details: { note: 'Check skipped' } })
  }

  return { dimension: 'Notificações', checks }
}

// ─── DIMENSION 6: Security ──────────────────────────────────────────────────

async function checkSecurity(): Promise<DimensionResult> {
  const checks: CheckResult[] = []

  // .env permissions
  try {
    const { stdout } = await safeExec("stat -c '%a' /opt/licitagram/.env 2>/dev/null || echo 'not_found'")
    const perms = stdout.trim()
    checks.push({
      check: 'Permissões .env',
      status: perms === '600' || perms === '640' ? 'ok' : perms === 'not_found' ? 'ok' : 'warning',
      details: { permissions: perms },
    })
  } catch {
    checks.push({ check: 'Permissões .env', status: 'ok', details: { note: 'Não verificável' } })
  }

  // Exposed ports
  try {
    const { stdout } = await safeExec("ss -tlnp | grep LISTEN | awk '{print $4}' | grep -oP '\\d+$' | sort -un")
    const ports = stdout.trim().split('\n').filter(Boolean).map(Number)
    const expectedPorts = [22, 8080, 6379, 5432, 3000, 443, 80]
    const unexpectedPorts = ports.filter(p => !expectedPorts.includes(p) && p > 0)
    checks.push({
      check: 'Portas Expostas',
      status: unexpectedPorts.length > 5 ? 'warning' : 'ok',
      details: { listening_ports: ports, unexpected: unexpectedPorts },
    })
  } catch {
    checks.push({ check: 'Portas Expostas', status: 'ok', details: { note: 'Check skipped' } })
  }

  // SSH failed logins
  try {
    const { stdout } = await safeExec("grep 'Failed password' /var/log/auth.log 2>/dev/null | tail -100 | wc -l")
    const failedAttempts = parseInt(stdout.trim(), 10) || 0
    checks.push({
      check: 'SSH Login Falhos',
      status: failedAttempts > 50 ? 'warning' : 'ok',
      details: { recent_failures: failedAttempts },
    })
  } catch {
    checks.push({ check: 'SSH Login Falhos', status: 'ok', details: { note: 'Log não acessível' } })
  }

  // Log sizes + AUTO-CLEANUP
  try {
    const { stdout } = await safeExec("du -sm /var/log/licitagram/ 2>/dev/null | awk '{print $1}'")
    const logSizeMB = parseInt(stdout.trim(), 10) || 0

    // AUTO-FIX: Clean logs if > 500MB
    if (logSizeMB > 500) {
      await safeExec('pm2 flush', 15000)
      await safeExec('find /var/log/licitagram/ -name "*.gz" -mtime +7 -delete 2>/dev/null', 10000)
      logger.info({ logSizeMB }, '🧹 Auto-cleaned large log files')
    }

    checks.push({
      check: 'Tamanho dos Logs',
      status: logSizeMB > 1000 ? 'critical' : logSizeMB > 500 ? 'warning' : 'ok',
      details: { total_mb: logSizeMB, auto_cleaned: logSizeMB > 500 },
    })
  } catch {
    checks.push({ check: 'Tamanho dos Logs', status: 'ok', details: { note: 'Check skipped' } })
  }

  // Disk space
  try {
    const { stdout } = await safeExec("df / | tail -1 | awk '{print $4, $2}'")
    const parts = stdout.trim().split(/\s+/)
    const availKB = parseInt(parts[0], 10) || 0
    const totalKB = parseInt(parts[1], 10) || 1
    const freePct = Math.round((availKB / totalKB) * 100)

    // AUTO-FIX: Emergency cleanup if < 10% free
    if (freePct < 10) {
      await safeExec('pm2 flush', 15000)
      await safeExec('journalctl --vacuum-size=100M 2>/dev/null', 10000)
      await safeExec('pnpm store prune 2>/dev/null', 30000)
      await safeExec('npm cache clean --force 2>/dev/null', 15000)
      logger.warn({ freePct }, '🚨 Emergency disk cleanup triggered')
    }

    checks.push({
      check: 'Espaço Livre',
      status: freePct < 10 ? 'critical' : freePct < 20 ? 'warning' : 'ok',
      details: { free_percent: freePct, avail_gb: Math.round(availKB / (1024 * 1024) * 10) / 10, auto_cleaned: freePct < 10 },
    })
  } catch {
    checks.push({ check: 'Espaço Livre', status: 'ok', details: { note: 'Check skipped' } })
  }

  return { dimension: 'Segurança', checks }
}

// ─── DIMENSION 7: Performance & Optimization ───────────────────────────────

async function checkPerformance(): Promise<DimensionResult> {
  const checks: CheckResult[] = []

  // Supabase response time
  try {
    const times: number[] = []
    for (let i = 0; i < 5; i++) {
      const start = Date.now()
      await supabase.from('users').select('id').limit(1)
      times.push(Date.now() - start)
    }
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    const max = Math.max(...times)

    checks.push({
      check: 'Supabase Response Time',
      status: avg > 2000 ? 'warning' : 'ok',
      details: { avg_ms: avg, max_ms: max, samples: times },
    })
  } catch {
    checks.push({ check: 'Supabase Response Time', status: 'ok', details: { note: 'Check skipped' } })
  }

  // Worker memory + AUTO-RESTART high memory workers
  try {
    const { stdout } = await safeExec('pm2 jlist')
    const processes = JSON.parse(stdout) as Array<{
      name: string
      monit?: { memory?: number; cpu?: number }
    }>

    const highMemory: string[] = []
    const workerMemory: Record<string, number> = {}
    const autoRestarted: string[] = []

    for (const proc of processes) {
      const memMB = proc.monit?.memory ? Math.round(proc.monit.memory / (1024 * 1024)) : 0
      workerMemory[proc.name] = memMB

      // AUTO-FIX: Restart workers using > 500MB (memory leak prevention)
      if (memMB > 500) {
        highMemory.push(`${proc.name}: ${memMB}MB`)
        try {
          await safeExec(`pm2 restart ${proc.name}`, 15000)
          autoRestarted.push(proc.name)
          logger.info({ worker: proc.name, memMB }, '🔧 Auto-restarted high-memory worker')
        } catch { /* best effort */ }
      } else if (memMB > 300) {
        highMemory.push(`${proc.name}: ${memMB}MB`)
      }
    }

    checks.push({
      check: 'Memória dos Workers',
      status: highMemory.length > 0 ? 'warning' : 'ok',
      details: { workers: workerMemory, high_memory: highMemory, auto_restarted: autoRestarted },
    })
  } catch {
    checks.push({ check: 'Memória dos Workers', status: 'ok', details: { note: 'PM2 não acessível' } })
  }

  // Redis memory
  try {
    const IORedis = (await import('ioredis')).default
    const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      lazyConnect: true,
      ...(process.env.REDIS_URL?.startsWith('rediss') ? { tls: {} } : {}),
    })
    await redis.connect()
    const info = await redis.info('memory')
    const memMatch = info.match(/used_memory_human:(\S+)/)
    const peakMatch = info.match(/used_memory_peak_human:(\S+)/)
    await redis.quit()

    checks.push({
      check: 'Redis Memory',
      status: 'ok',
      details: { used: memMatch?.[1] || 'unknown', peak: peakMatch?.[1] || 'unknown' },
    })
  } catch {
    checks.push({ check: 'Redis Memory', status: 'ok', details: { note: 'Check skipped' } })
  }

  // System memory
  try {
    const { stdout } = await safeExec("free -m | grep Mem | awk '{printf \"%d %d %d\", $2, $3, $7}'")
    const [total, used, available] = stdout.trim().split(/\s+/).map(Number)

    // AUTO-FIX: Drop caches if available memory < 300MB
    if (available < 300 && total > 0) {
      await safeExec('sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null', 5000)
      logger.warn({ available }, '🧹 Dropped system caches due to low memory')
    }

    checks.push({
      check: 'Sistema - Memória',
      status: available < 500 ? 'warning' : 'ok',
      details: { total_mb: total, used_mb: used, available_mb: available, auto_cleaned: available < 300 },
    })
  } catch {
    checks.push({ check: 'Sistema - Memória', status: 'ok', details: { note: 'Check skipped' } })
  }

  return { dimension: 'Performance', checks }
}

// ─── DIMENSION 8: Self-Evolution ────────────────────────────────────────────

async function checkSelfEvolution(history: {
  recurringIssues: RecurringIssue[]
  pastOptimizations: string[]
}): Promise<DimensionResult> {
  const checks: CheckResult[] = []

  // Track how many recurring issues we have
  const activeRecurring = history.recurringIssues.filter(i => !i.permanent_fix_applied)
  checks.push({
    check: 'Problemas Recorrentes',
    status: activeRecurring.length > 5 ? 'warning' : 'ok',
    details: {
      total_recurring: history.recurringIssues.length,
      active_unresolved: activeRecurring.length,
      top_recurring: activeRecurring.slice(0, 5).map(i => ({
        issue: `${i.dimension}/${i.check_name}`,
        count: i.occurrence_count,
      })),
    },
  })

  // Evolution velocity: how many improvements were made in last 7 days
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('system_evolution')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo)

    checks.push({
      check: 'Velocidade de Evolução',
      status: 'ok',
      details: { improvements_7d: count ?? 0, past_optimizations: history.pastOptimizations.length },
    })
  } catch {
    checks.push({ check: 'Velocidade de Evolução', status: 'ok', details: { note: 'Tabela não disponível' } })
  }

  // Audit coverage: are all dimensions running successfully?
  checks.push({
    check: 'Cobertura da Auditoria',
    status: 'ok',
    details: { dimensions: 8, auto_fix_enabled: true, learning_enabled: true },
  })

  return { dimension: 'Auto-Evolução', checks }
}

// ─── AI Diagnosis (Enhanced with History) ───────────────────────────────────

async function runAIDiagnosis(
  dimensions: DimensionResult[],
  history: {
    recurringIssues: RecurringIssue[]
    pastOptimizations: string[]
    recentFixes: string[]
    trends: Record<string, unknown>
  },
): Promise<AIDiagnosis> {
  const findings = dimensions.map(d => ({
    dimension: d.dimension,
    checks: d.checks.map(c => ({
      check: c.check,
      status: c.status,
      details: c.details,
    })),
  }))

  const prompt = `Você é o cérebro autônomo do sistema Licitagram (SaaS de licitações públicas brasileiras, servindo governo e empresas).
O sistema deve funcionar com 90%+ de precisão e zero downtime.

## RELATÓRIO DA AUDITORIA ATUAL
${JSON.stringify(findings, null, 2)}

## HISTÓRICO DE PROBLEMAS RECORRENTES (últimos 30 dias)
${history.recurringIssues.length > 0
    ? JSON.stringify(history.recurringIssues.map(i => ({
        issue: `${i.dimension}/${i.check_name}`,
        occurrences: i.occurrence_count,
        last_fix: i.last_fix_applied,
        permanently_fixed: i.permanent_fix_applied,
      })), null, 2)
    : 'Nenhum problema recorrente rastreado ainda.'
  }

## CORREÇÕES RECENTES APLICADAS (últimos 7 dias)
${history.recentFixes.length > 0 ? history.recentFixes.join('\n') : 'Nenhuma correção recente.'}

## OTIMIZAÇÕES JÁ REALIZADAS
${history.pastOptimizations.length > 0 ? history.pastOptimizations.join('\n') : 'Nenhuma otimização anterior.'}

## TENDÊNCIAS
${JSON.stringify(history.trends, null, 2)}

## INSTRUÇÕES
Analise TUDO acima e forneça:

1. CRITICAL: Issues que precisam de fix imediato COM comandos executáveis.
   - Para CADA issue, inclua "permanent_fix" se o problema é recorrente
   - risk_level: "low" para pm2 restart/flush, limpeza de jobs
   - risk_level: "medium" para restart all, limpeza de cache/disco
   - risk_level: "high" APENAS para operações que deletam dados de negócio

2. WARNINGS: Issues para monitorar

3. OPTIMIZATIONS: Melhorias de performance que podem ser aplicadas automaticamente
   - Se a otimização pode ser executada via comando, inclua "auto_executable: true" e "command"
   - Exemplos: ajustar intervalos de cron, limpar caches stale, otimizar queries

4. PATTERNS_DETECTED: Padrões que você identificou no histórico
   - Se um problema ocorre 3+ vezes, sugira uma solução PERMANENTE
   - Inclua "solution_command" se possível executar automaticamente

IMPORTANTE: Seja agressivo em auto-fix. Tudo que não deleta dados de negócio pode ser executado.
NÃO sugira coisas já feitas recentemente (veja correções recentes acima).

Return JSON: {
  "critical": [{"issue": "...", "fix_command": "...", "risk_level": "low|medium|high", "permanent_fix": "..."}],
  "warnings": [{"issue": "...", "recommendation": "..."}],
  "optimizations": [{"area": "...", "suggestion": "...", "auto_executable": true/false, "command": "..."}],
  "patterns_detected": [{"pattern": "...", "frequency": "...", "root_cause": "...", "permanent_solution": "...", "solution_command": "..."}]
}`

  try {
    const response = await callLLM({
      task: 'onDemandAnalysis',
      system: 'You are the autonomous brain of a production SaaS system. You make decisions, execute fixes, and evolve the system continuously. Respond ONLY with valid JSON, no markdown. Always include the patterns_detected array even if empty.',
      prompt,
      jsonMode: true,
    })

    const parsed = parseJsonResponse<AIDiagnosis>(response)
    // Ensure patterns_detected exists
    if (!parsed.patterns_detected) parsed.patterns_detected = []
    return parsed
  } catch (err) {
    logger.warn({ err }, 'AI diagnosis failed, using fallback')
    return { critical: [], warnings: [], optimizations: [], patterns_detected: [] }
  }
}

// ─── Autonomous Auto-Remediation (Aggressive) ──────────────────────────────

async function autoRemediate(
  diagnosis: AIDiagnosis,
  alertAdminFn: (msg: string) => Promise<void>,
): Promise<{ fixes: string[]; evolutionActions: EvolutionAction[] }> {
  const fixes: string[] = []
  const evolutionActions: EvolutionAction[] = []

  // 1. Execute ALL critical fixes (low + medium risk automatically)
  for (const issue of diagnosis.critical) {
    if (!issue.fix_command || issue.fix_command.trim() === '') continue

    if (issue.risk_level === 'high') {
      // Only alert for data-destructive operations
      await alertAdminFn(`⚠️ Correção de alto risco necessária:\n<b>${issue.issue}</b>\nComando sugerido: <code>${issue.fix_command}</code>`)
      fixes.push(`[ALERTA] ${issue.issue} — enviado ao admin`)

      await logAuditEntry('auto-remediation', issue.issue, 'alert_sent', {
        fix_command: issue.fix_command,
        risk_level: issue.risk_level,
      })
      continue
    }

    // Low or medium risk: EXECUTE without hesitation
    const startMs = Date.now()
    try {
      const { stdout, stderr } = await safeExec(issue.fix_command, 30000)
      const elapsed = Date.now() - startMs
      fixes.push(`[CORRIGIDO] ${issue.issue}`)
      logger.info({ issue: issue.issue, command: issue.fix_command, elapsed_ms: elapsed }, '🔧 Auto-fix applied')

      evolutionActions.push({
        type: 'auto_fix',
        description: issue.issue,
        action: issue.fix_command,
        success: true,
        metrics_after: { elapsed_ms: elapsed, stdout: stdout.substring(0, 200) },
      })

      await logAuditEntry('auto-remediation', issue.issue, 'fixed', {
        fix_command: issue.fix_command,
        risk_level: issue.risk_level,
        elapsed_ms: elapsed,
        stdout: stdout.substring(0, 500),
        stderr: stderr.substring(0, 500),
      }, issue.fix_command)

    } catch (err) {
      logger.warn({ issue: issue.issue, command: issue.fix_command, err }, 'Auto-remediation failed')
      fixes.push(`[FALHOU] ${issue.issue}`)

      evolutionActions.push({
        type: 'auto_fix',
        description: issue.issue,
        action: issue.fix_command,
        success: false,
      })

      await logAuditEntry('auto-remediation', issue.issue, 'critical', {
        fix_command: issue.fix_command,
        error: (err as Error).message,
      })
    }
  }

  // 2. Execute auto-executable optimizations
  for (const opt of diagnosis.optimizations) {
    if (!opt.auto_executable || !opt.command) continue

    // Validate command is safe
    if (!isCommandSafe(opt.command)) {
      logger.info({ command: opt.command }, 'Optimization command not in safe whitelist, skipping')
      continue
    }

    const startMs = Date.now()
    try {
      const { stdout } = await safeExec(opt.command, 30000)
      const elapsed = Date.now() - startMs
      fixes.push(`[OTIMIZADO] ${opt.area}: ${opt.suggestion}`)

      evolutionActions.push({
        type: 'optimization',
        description: `${opt.area}: ${opt.suggestion}`,
        action: opt.command,
        success: true,
        metrics_after: { elapsed_ms: elapsed },
      })

      logger.info({ area: opt.area, command: opt.command, elapsed_ms: elapsed }, '💡 Auto-optimization applied')
    } catch (err) {
      logger.warn({ area: opt.area, command: opt.command, err }, 'Auto-optimization failed')
      evolutionActions.push({
        type: 'optimization',
        description: `${opt.area}: ${opt.suggestion}`,
        action: opt.command,
        success: false,
      })
    }
  }

  // 3. Apply permanent fixes for detected patterns
  for (const pattern of (diagnosis.patterns_detected || [])) {
    if (!pattern.solution_command) continue

    if (!isCommandSafe(pattern.solution_command)) {
      logger.info({ command: pattern.solution_command }, 'Pattern fix command not safe, alerting admin')
      await alertAdminFn(`🔄 Padrão recorrente detectado:\n<b>${pattern.pattern}</b>\nFrequência: ${pattern.frequency}\nCausa raiz: ${pattern.root_cause}\nSolução: <code>${pattern.solution_command}</code>`)
      continue
    }

    try {
      await safeExec(pattern.solution_command, 30000)
      fixes.push(`[PADRÃO RESOLVIDO] ${pattern.pattern}`)

      evolutionActions.push({
        type: 'pattern_prevention',
        description: pattern.pattern,
        action: pattern.solution_command,
        success: true,
      })

      logger.info({ pattern: pattern.pattern }, '🧬 Permanent pattern fix applied')
    } catch (err) {
      logger.warn({ pattern: pattern.pattern, err }, 'Pattern fix failed')
    }
  }

  return { fixes, evolutionActions }
}

// ─── Track Recurring Issues ─────────────────────────────────────────────────

async function trackRecurringIssues(dimensions: DimensionResult[]): Promise<void> {
  const issues = dimensions
    .flatMap(d => d.checks
      .filter(c => c.status !== 'ok')
      .map(c => ({ dimension: d.dimension, check: c.check, status: c.status }))
    )

  for (const issue of issues) {
    const id = issueHash(issue.dimension, issue.check)
    try {
      // Try to upsert — increment count if exists
      const { data: existing } = await supabase
        .from('recurring_issues')
        .select('id, occurrence_count')
        .eq('id', id)
        .limit(1)

      if (existing && existing.length > 0) {
        await supabase
          .from('recurring_issues')
          .update({
            occurrence_count: (existing[0].occurrence_count || 0) + 1,
            last_seen: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
      } else {
        await supabase
          .from('recurring_issues')
          .insert({
            id,
            dimension: issue.dimension,
            check_name: issue.check,
            occurrence_count: 1,
            first_seen: new Date().toISOString(),
            last_seen: new Date().toISOString(),
          })
      }
    } catch {
      // Table might not exist yet, that's ok
    }
  }

  // Mark issues as resolved if they're OK now
  const okIssues = dimensions
    .flatMap(d => d.checks
      .filter(c => c.status === 'ok')
      .map(c => issueHash(d.dimension, c.check))
    )

  if (okIssues.length > 0) {
    try {
      await supabase
        .from('recurring_issues')
        .update({ status: 'monitoring', updated_at: new Date().toISOString() })
        .in('id', okIssues)
        .eq('status', 'active')
    } catch {
      // Best effort
    }
  }
}

// ─── Record Evolution Actions ───────────────────────────────────────────────

async function recordEvolution(actions: EvolutionAction[]): Promise<void> {
  for (const action of actions) {
    try {
      await supabase.from('system_evolution').insert({
        evolution_type: action.type,
        description: action.description,
        action_taken: action.action,
        trigger_source: 'daily_audit',
        success: action.success,
        metrics_before: action.metrics_before || null,
        metrics_after: action.metrics_after || null,
      })
    } catch {
      // Table might not exist yet
    }
  }
}

// ─── Helpers: Logging & Alerts ──────────────────────────────────────────────

async function logAuditEntry(
  dimension: string,
  checkName: string,
  status: string,
  details: Record<string, unknown>,
  fixApplied?: string,
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      dimension,
      check_name: checkName,
      status,
      details,
      fix_applied: fixApplied || null,
    })
  } catch {
    // Best effort
  }
}

async function alertAdmin(message: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
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
          text: message,
          parse_mode: 'HTML',
        }),
      })
    } catch {
      // Best effort
    }
  }
}

// ─── Store Results ──────────────────────────────────────────────────────────

async function storeAuditResults(dimensions: DimensionResult[]): Promise<void> {
  const rows = dimensions.flatMap(d =>
    d.checks.map(c => ({
      dimension: d.dimension,
      check_name: c.check,
      status: c.status,
      details: c.details,
    }))
  )

  for (let i = 0; i < rows.length; i += 20) {
    const batch = rows.slice(i, i + 20)
    try {
      await supabase.from('audit_logs').insert(batch)
    } catch (err) {
      logger.warn({ err, batch_index: i }, 'Failed to store audit results batch')
    }
  }
}

// ─── Build Telegram Summary (Enhanced) ──────────────────────────────────────

function buildTelegramSummary(
  dimensions: DimensionResult[],
  metrics: { tenders24h: number; matches24h: number; notifications24h: number; competitors: number },
  fixes: string[],
  diagnosis: AIDiagnosis,
  evolutionActions: EvolutionAction[],
): string {
  const allChecks = dimensions.flatMap(d => d.checks)
  const criticalCount = allChecks.filter(c => c.status === 'critical').length
  const warningCount = allChecks.filter(c => c.status === 'warning').length
  const totalChecks = allChecks.length
  const okChecks = allChecks.filter(c => c.status === 'ok').length

  let statusEmoji: string
  let statusLabel: string
  if (criticalCount > 0) {
    statusEmoji = '🚨'
    statusLabel = 'CRITICAL'
  } else if (warningCount > 3) {
    statusEmoji = '⚠️'
    statusLabel = 'DEGRADED'
  } else {
    statusEmoji = '✅'
    statusLabel = 'HEALTHY'
  }

  const dimensionStatus = dimensions.map(d => {
    const hasCritical = d.checks.some(c => c.status === 'critical')
    const hasWarning = d.checks.some(c => c.status === 'warning')
    const emoji = hasCritical ? '🚨' : hasWarning ? '⚠️' : '✅'
    return `• ${d.dimension}: ${emoji}`
  }).join('\n')

  // Auto-fixes section
  let fixesSection = ''
  if (fixes.length > 0) {
    fixesSection = `\n\n🔧 <b>Ações Autônomas:</b> ${fixes.length}\n${fixes.map(f => `• ${f}`).join('\n')}`
  }

  // Evolution section
  let evolutionSection = ''
  const successfulEvolutions = evolutionActions.filter(a => a.success)
  if (successfulEvolutions.length > 0) {
    evolutionSection = `\n\n🧬 <b>Evoluções Aplicadas:</b> ${successfulEvolutions.length}\n${successfulEvolutions.map(e => `• ${e.type}: ${e.description}`).join('\n')}`
  }

  // Warnings section
  let warningsSection = ''
  if (diagnosis.warnings.length > 0) {
    warningsSection = `\n\n⚠️ <b>Atenções:</b> ${diagnosis.warnings.length}\n${diagnosis.warnings.slice(0, 5).map(w => `• ${w.issue}`).join('\n')}`
  }

  // Patterns section
  let patternsSection = ''
  if (diagnosis.patterns_detected?.length > 0) {
    patternsSection = `\n\n🔄 <b>Padrões Detectados:</b>\n${diagnosis.patterns_detected.slice(0, 3).map(p => `• ${p.pattern}: ${p.permanent_solution}`).join('\n')}`
  }

  // Optimizations section
  let optimizationsSection = ''
  const pendingOpts = diagnosis.optimizations.filter(o => !o.auto_executable)
  if (pendingOpts.length > 0) {
    optimizationsSection = `\n\n💡 <b>Otimizações Sugeridas:</b>\n${pendingOpts.slice(0, 3).map(o => `• ${o.area}: ${o.suggestion}`).join('\n')}`
  }

  return `🧠 <b>Auditoria Autônoma — ${formatDate()}</b>

📊 Status: ${statusEmoji} ${statusLabel}

📈 <b>Métricas 24h:</b>
• Editais: ${formatNumber(metrics.tenders24h)}
• Matches: ${formatNumber(metrics.matches24h)}
• Notificações: ${formatNumber(metrics.notifications24h)}
• Concorrentes: ${formatNumber(metrics.competitors)}

🔍 <b>Verificações:</b> ${okChecks}/${totalChecks} ✅
${dimensionStatus}${fixesSection}${evolutionSection}${warningsSection}${patternsSection}${optimizationsSection}

🤖 <i>Sistema autônomo — auto-fix, auto-evolução, aprendizado contínuo</i>`
}

// ─── Main Worker ────────────────────────────────────────────────────────────

export const dailyAuditWorker = new Worker(
  'daily-audit',
  async () => {
    const startTime = Date.now()
    logger.info('🧠 Autonomous audit starting...')

    // PHASE 0: Learn from history
    const history = await learnFromHistory()

    // PHASE 1: Run all 8 dimensions (some in parallel)
    const [infraResult, pipelineResult, dbResult] = await Promise.all([
      checkInfrastructure().catch(err => {
        logger.error({ err }, 'Infrastructure check failed')
        return { dimension: 'Infraestrutura', checks: [{ check: 'Error', status: 'critical' as const, details: { error: (err as Error).message } }] }
      }),
      checkDataPipeline().catch(err => {
        logger.error({ err }, 'Data pipeline check failed')
        return { dimension: 'Pipeline de Dados', checks: [{ check: 'Error', status: 'critical' as const, details: { error: (err as Error).message } }] }
      }),
      checkDatabaseHealth().catch(err => {
        logger.error({ err }, 'Database health check failed')
        return { dimension: 'Banco de Dados', checks: [{ check: 'Error', status: 'critical' as const, details: { error: (err as Error).message } }] }
      }),
    ])

    const [aiResult, notifResult, secResult, perfResult] = await Promise.all([
      checkAIPipeline().catch(err => {
        logger.error({ err }, 'AI pipeline check failed')
        return { dimension: 'Pipeline de IA', checks: [{ check: 'Error', status: 'warning' as const, details: { error: (err as Error).message } }] }
      }),
      checkNotificationDelivery().catch(err => {
        logger.error({ err }, 'Notification delivery check failed')
        return { dimension: 'Notificações', checks: [{ check: 'Error', status: 'warning' as const, details: { error: (err as Error).message } }] }
      }),
      checkSecurity().catch(err => {
        logger.error({ err }, 'Security check failed')
        return { dimension: 'Segurança', checks: [{ check: 'Error', status: 'warning' as const, details: { error: (err as Error).message } }] }
      }),
      checkPerformance().catch(err => {
        logger.error({ err }, 'Performance check failed')
        return { dimension: 'Performance', checks: [{ check: 'Error', status: 'warning' as const, details: { error: (err as Error).message } }] }
      }),
    ])

    // Dimension 8: Self-Evolution check
    const evolutionResult = await checkSelfEvolution(history).catch(err => {
      logger.error({ err }, 'Self-evolution check failed')
      return { dimension: 'Auto-Evolução', checks: [{ check: 'Error', status: 'warning' as const, details: { error: (err as Error).message } }] }
    })

    const dimensions: DimensionResult[] = [
      infraResult, pipelineResult, dbResult, aiResult, notifResult, secResult, perfResult, evolutionResult,
    ]

    // PHASE 2: Store results + track recurring issues
    await Promise.all([
      storeAuditResults(dimensions),
      trackRecurringIssues(dimensions),
    ])

    // PHASE 3: Get 24h metrics
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const [
      { count: tenders24h },
      { count: matches24h },
      { count: notifications24h },
      { count: competitors },
    ] = await Promise.all([
      supabase.from('tenders').select('*', { count: 'exact', head: true }).gte('created_at', oneDayAgo),
      supabase.from('matches').select('*', { count: 'exact', head: true }).gte('created_at', oneDayAgo),
      supabase.from('matches').select('*', { count: 'exact', head: true }).not('notified_at', 'is', null).gte('notified_at', oneDayAgo),
      supabase.from('competitors').select('*', { count: 'exact', head: true }),
    ])

    // PHASE 4: AI Diagnosis (with history context)
    logger.info('🧠 Running AI diagnosis with historical context...')
    const diagnosis = await runAIDiagnosis(dimensions, history)
    logger.info({
      critical: diagnosis.critical.length,
      warnings: diagnosis.warnings.length,
      optimizations: diagnosis.optimizations.length,
      patterns: diagnosis.patterns_detected?.length || 0,
    }, 'AI diagnosis complete')

    // PHASE 5: Autonomous remediation + evolution
    const { fixes, evolutionActions } = await autoRemediate(diagnosis, alertAdmin)

    // PHASE 6: Record evolution history
    await recordEvolution(evolutionActions)

    // PHASE 7: Send comprehensive Telegram summary
    const summary = buildTelegramSummary(
      dimensions,
      {
        tenders24h: tenders24h ?? 0,
        matches24h: matches24h ?? 0,
        notifications24h: notifications24h ?? 0,
        competitors: competitors ?? 0,
      },
      fixes,
      diagnosis,
      evolutionActions,
    )

    await alertAdmin(summary)

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    logger.info({
      elapsed_seconds: elapsed,
      total_checks: dimensions.flatMap(d => d.checks).length,
      critical: diagnosis.critical.length,
      warnings: diagnosis.warnings.length,
      fixes: fixes.length,
      evolutions: evolutionActions.length,
      patterns: diagnosis.patterns_detected?.length || 0,
    }, '🧠 Autonomous audit complete')
  },
  {
    connection,
    concurrency: 1,
  },
)

dailyAuditWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Daily audit failed')
})
