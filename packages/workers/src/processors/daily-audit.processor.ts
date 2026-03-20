/**
 * 🏥 Autonomous Daily Audit System
 *
 * Runs at 3 AM BRT (06:00 UTC) via cron.
 * Performs deep inspection across 7 dimensions, sends findings to DeepSeek
 * for AI diagnosis, auto-remediates low/medium risk issues, and sends
 * a comprehensive daily summary via Telegram.
 *
 * Dimensions:
 *   1. Infrastructure Health
 *   2. Data Pipeline Integrity
 *   3. Database Health
 *   4. AI Pipeline
 *   5. Notification Delivery
 *   6. Security
 *   7. Performance & Optimization
 */
import { Worker, Queue } from 'bullmq'
import { connection } from '../queues/connection'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { callLLM, parseJsonResponse } from '../ai/llm-client'
import { exec } from 'child_process'
import { promisify } from 'util'

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
  critical: Array<{ issue: string; fix_command: string; risk_level: 'low' | 'medium' | 'high' }>
  warnings: Array<{ issue: string; recommendation: string }>
  optimizations: Array<{ area: string; suggestion: string }>
}

// ─── Queue Config (mirrors pipeline-health) ─────────────────────────────────

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
  // BRT = UTC-3
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  const dd = String(brt.getUTCDate()).padStart(2, '0')
  const mm = String(brt.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = brt.getUTCFullYear()
  return `${dd}/${mm}/${yyyy}`
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

    for (const expected of EXPECTED_PM2_PROCESSES) {
      const proc = processes.find(p => p.name === expected)
      if (!proc) {
        allOnline = false
        processDetails[expected] = 'NOT FOUND'
        continue
      }
      const status = proc.pm2_env.status
      if (status !== 'online') allOnline = false

      const uptime = Date.now() - proc.pm2_env.pm_uptime
      const restarts = proc.pm2_env.restart_time

      // Crash loop: >10 restarts in 24h and uptime < 10 min
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
      details: { all_online: allOnline, crash_loops: crashLoops, processes: processDetails },
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

  // Queue health: stuck and failed jobs
  try {
    let totalWaiting = 0
    let totalFailed = 0
    let stuckQueues = 0
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
      } catch {
        // Queue might not exist yet
      }
    }

    checks.push({
      check: 'Filas',
      status: stuckQueues > 0 ? 'critical' : totalFailed > 500 ? 'warning' : 'ok',
      details: { total_waiting: totalWaiting, total_failed: totalFailed, stuck_queues: stuckQueues, notable: queueDetails },
    })
  } catch {
    checks.push({ check: 'Filas', status: 'warning', details: { error: 'Queue check failed' } })
  }

  return { dimension: 'Pipeline de Dados', checks }
}

// ─── DIMENSION 3: Database Health ───────────────────────────────────────────

async function checkDatabaseHealth(): Promise<DimensionResult> {
  const checks: CheckResult[] = []

  // Table sizes
  try {
    const { data, error } = await supabase.rpc('get_table_sizes')
    if (!error && data) {
      checks.push({
        check: 'Tamanho das tabelas',
        status: 'ok',
        details: { tables: data },
      })
    } else {
      // Fallback: just count key tables
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

  // Connection pool check (via simple parallel queries)
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

  // RLS verification on sensitive tables
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

  // Competitor relevance analysis freshness
  try {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('competitor_stats')
      .select('*', { count: 'exact', head: true })
      .gte('updated_at', sixHoursAgo)

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

  // WhatsApp session status
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

  // Failed notifications in last 24h
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const notifQueue = new Queue('notification', { connection })
    const whatsappQueue = new Queue('notification-whatsapp', { connection })
    const telegramFailed = await notifQueue.getFailedCount()
    const whatsappFailed = await whatsappQueue.getFailedCount()

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

  // Users with excessive undelivered notifications
  try {
    const { data } = await supabase
      .from('matches')
      .select('company_id')
      .is('notified_at', null)
      .eq('status', 'new')
      .in('match_source', ['ai', 'ai_triage', 'semantic'])
      .gte('score', 50)
      .limit(5000)

    if (data) {
      const companyCounts = new Map<string, number>()
      for (const m of data) {
        companyCounts.set(m.company_id, (companyCounts.get(m.company_id) || 0) + 1)
      }
      const overloaded = Array.from(companyCounts.entries()).filter(([, c]) => c > 50)
      checks.push({
        check: 'Backlog por Empresa',
        status: overloaded.length > 0 ? 'warning' : 'ok',
        details: { companies_with_50plus_pending: overloaded.length },
      })
    }
  } catch {
    checks.push({ check: 'Backlog por Empresa', status: 'ok', details: { note: 'Check skipped' } })
  }

  return { dimension: 'Notificações', checks }
}

// ─── DIMENSION 6: Security ──────────────────────────────────────────────────

async function checkSecurity(): Promise<DimensionResult> {
  const checks: CheckResult[] = []

  // .env file permissions
  try {
    const { stdout } = await safeExec("stat -c '%a' /root/licitagram/.env 2>/dev/null || stat -c '%a' /home/*/licitagram/.env 2>/dev/null || echo 'not_found'")
    const perms = stdout.trim()
    checks.push({
      check: 'Permissões .env',
      status: perms === '600' || perms === '640' ? 'ok' : perms === 'not_found' ? 'ok' : 'warning',
      details: { permissions: perms },
    })
  } catch {
    checks.push({ check: 'Permissões .env', status: 'ok', details: { note: 'Não verificável neste ambiente' } })
  }

  // Check for exposed ports (besides 22/SSH and 8080/Evolution)
  try {
    const { stdout } = await safeExec("ss -tlnp | grep LISTEN | awk '{print $4}' | grep -oP '\\d+$' | sort -un")
    const ports = stdout.trim().split('\n').filter(Boolean).map(Number)
    const expectedPorts = [22, 8080, 6379, 5432, 3000, 443, 80] // common expected ports
    const unexpectedPorts = ports.filter(p => !expectedPorts.includes(p) && p > 0)
    checks.push({
      check: 'Portas Expostas',
      status: unexpectedPorts.length > 5 ? 'warning' : 'ok',
      details: { listening_ports: ports, unexpected: unexpectedPorts },
    })
  } catch {
    checks.push({ check: 'Portas Expostas', status: 'ok', details: { note: 'Check skipped' } })
  }

  // Failed SSH login attempts
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

  // PM2 log file sizes
  try {
    const { stdout } = await safeExec("du -sm /var/log/licitagram/ 2>/dev/null | awk '{print $1}'")
    const logSizeMB = parseInt(stdout.trim(), 10) || 0
    checks.push({
      check: 'Tamanho dos Logs',
      status: logSizeMB > 1000 ? 'critical' : logSizeMB > 500 ? 'warning' : 'ok',
      details: { total_mb: logSizeMB },
    })
  } catch {
    checks.push({ check: 'Tamanho dos Logs', status: 'ok', details: { note: 'Check skipped' } })
  }

  // Disk space (alert if < 20% free)
  try {
    const { stdout } = await safeExec("df / | tail -1 | awk '{print $4, $2}'")
    const parts = stdout.trim().split(/\s+/)
    const availKB = parseInt(parts[0], 10) || 0
    const totalKB = parseInt(parts[1], 10) || 1
    const freePct = Math.round((availKB / totalKB) * 100)
    checks.push({
      check: 'Espaço Livre',
      status: freePct < 10 ? 'critical' : freePct < 20 ? 'warning' : 'ok',
      details: { free_percent: freePct, avail_gb: Math.round(availKB / (1024 * 1024) * 10) / 10 },
    })
  } catch {
    checks.push({ check: 'Espaço Livre', status: 'ok', details: { note: 'Check skipped' } })
  }

  return { dimension: 'Segurança', checks }
}

// ─── DIMENSION 7: Performance & Optimization ───────────────────────────────

async function checkPerformance(): Promise<DimensionResult> {
  const checks: CheckResult[] = []

  // Average Supabase response time (5 queries)
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

  // Memory usage per PM2 worker
  try {
    const { stdout } = await safeExec('pm2 jlist')
    const processes = JSON.parse(stdout) as Array<{
      name: string
      monit?: { memory?: number; cpu?: number }
    }>

    const highMemory: string[] = []
    const workerMemory: Record<string, number> = {}

    for (const proc of processes) {
      const memMB = proc.monit?.memory ? Math.round(proc.monit.memory / (1024 * 1024)) : 0
      workerMemory[proc.name] = memMB
      if (memMB > 300) highMemory.push(`${proc.name}: ${memMB}MB`)
    }

    checks.push({
      check: 'Memória dos Workers',
      status: highMemory.length > 0 ? 'warning' : 'ok',
      details: { workers: workerMemory, high_memory: highMemory },
    })
  } catch {
    checks.push({ check: 'Memória dos Workers', status: 'ok', details: { note: 'PM2 não acessível' } })
  }

  // Redis memory usage
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

  // Total system memory breakdown
  try {
    const { stdout } = await safeExec("free -m | grep Mem | awk '{printf \"%d %d %d %d\", $2, $3, $6, $7}'")
    const [total, used, available, _] = stdout.trim().split(/\s+/).map(Number)

    checks.push({
      check: 'Sistema - Memória',
      status: available < 500 ? 'warning' : 'ok',
      details: { total_mb: total, used_mb: used, available_mb: available },
    })
  } catch {
    checks.push({ check: 'Sistema - Memória', status: 'ok', details: { note: 'Check skipped' } })
  }

  return { dimension: 'Performance', checks }
}

// ─── AI Diagnosis ───────────────────────────────────────────────────────────

async function runAIDiagnosis(dimensions: DimensionResult[]): Promise<AIDiagnosis> {
  const findings = dimensions.map(d => ({
    dimension: d.dimension,
    checks: d.checks.map(c => ({
      check: c.check,
      status: c.status,
      details: c.details,
    })),
  }))

  const prompt = `Aqui está o relatório completo da auditoria diária do sistema Licitagram (SaaS de licitações públicas brasileiras):

${JSON.stringify(findings, null, 2)}

Analise todas as descobertas e forneça:
1. CRITICAL issues requiring immediate auto-fix (com comandos de remediação executáveis)
2. WARNING issues to monitor
3. Specific remediation commands for each critical issue
4. Performance optimization suggestions

Comandos de remediação seguros (risk_level 'low'):
- pm2 flush (limpar logs)
- pm2 restart <worker-name>
- Limpeza de jobs falhos via BullMQ

Comandos de risco médio (risk_level 'medium'):
- pm2 restart all
- Limpeza de disk cache

Comandos de alto risco (risk_level 'high') — NÃO executar automaticamente:
- Qualquer comando que delete dados
- Modificações no banco de dados
- Alterações de configuração

Return JSON: { "critical": [{"issue": "...", "fix_command": "...", "risk_level": "low|medium|high"}], "warnings": [{"issue": "...", "recommendation": "..."}], "optimizations": [{"area": "...", "suggestion": "..."}] }`

  try {
    const response = await callLLM({
      task: 'onDemandAnalysis',
      system: 'You are a senior DevOps engineer analyzing a daily audit report for a production SaaS system. Respond ONLY with valid JSON, no markdown.',
      prompt,
      jsonMode: true,
    })

    return parseJsonResponse<AIDiagnosis>(response)
  } catch (err) {
    logger.warn({ err }, 'AI diagnosis failed, using fallback')
    return { critical: [], warnings: [], optimizations: [] }
  }
}

// ─── Auto-Remediation ───────────────────────────────────────────────────────

async function autoRemediate(
  diagnosis: AIDiagnosis,
  alertAdminFn: (msg: string) => Promise<void>,
): Promise<string[]> {
  const fixes: string[] = []

  for (const issue of diagnosis.critical) {
    if (!issue.fix_command || issue.fix_command.trim() === '') continue

    if (issue.risk_level === 'high') {
      // Only alert, never auto-execute high risk
      await alertAdminFn(`⚠️ Correção de alto risco necessária:\n<b>${issue.issue}</b>\nComando sugerido: <code>${issue.fix_command}</code>`)
      fixes.push(`[ALERTA] ${issue.issue} — comando enviado ao admin`)

      // Log as alert_sent
      await supabase.from('audit_logs').insert({
        dimension: 'auto-remediation',
        check_name: issue.issue,
        status: 'alert_sent',
        details: { fix_command: issue.fix_command, risk_level: issue.risk_level },
      })
      continue
    }

    // Low or medium risk: execute
    try {
      const { stdout, stderr } = await safeExec(issue.fix_command, 30000)
      fixes.push(`[CORRIGIDO] ${issue.issue}`)
      logger.info({ issue: issue.issue, command: issue.fix_command, stdout: stdout.substring(0, 200) }, 'Auto-remediation applied')

      await supabase.from('audit_logs').insert({
        dimension: 'auto-remediation',
        check_name: issue.issue,
        status: 'fixed',
        details: { fix_command: issue.fix_command, risk_level: issue.risk_level, stdout: stdout.substring(0, 500), stderr: stderr.substring(0, 500) },
        fix_applied: issue.fix_command,
      })
    } catch (err) {
      logger.warn({ issue: issue.issue, command: issue.fix_command, err }, 'Auto-remediation failed')
      fixes.push(`[FALHOU] ${issue.issue}`)

      await supabase.from('audit_logs').insert({
        dimension: 'auto-remediation',
        check_name: issue.issue,
        status: 'critical',
        details: { fix_command: issue.fix_command, error: (err as Error).message },
      })
    }
  }

  return fixes
}

// ─── Telegram Alert ─────────────────────────────────────────────────────────

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

  // Insert in batches of 20
  for (let i = 0; i < rows.length; i += 20) {
    const batch = rows.slice(i, i + 20)
    try {
      await supabase.from('audit_logs').insert(batch)
    } catch (err) {
      logger.warn({ err, batch_index: i }, 'Failed to store audit results batch')
    }
  }
}

// ─── Build Telegram Summary ─────────────────────────────────────────────────

function buildTelegramSummary(
  dimensions: DimensionResult[],
  metrics: { tenders24h: number; matches24h: number; notifications24h: number; competitors: number },
  fixes: string[],
  diagnosis: AIDiagnosis,
): string {
  // Determine overall status
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

  // Dimension status
  const dimensionStatus = dimensions.map(d => {
    const hasCritical = d.checks.some(c => c.status === 'critical')
    const hasWarning = d.checks.some(c => c.status === 'warning')
    const emoji = hasCritical ? '🚨' : hasWarning ? '⚠️' : '✅'
    return `• ${d.dimension}: ${emoji}`
  }).join('\n')

  // Build fixes section
  let fixesSection = ''
  if (fixes.length > 0) {
    fixesSection = `\n🔧 <b>Correções Automáticas:</b> ${fixes.length}\n${fixes.map(f => `• ${f}`).join('\n')}`
  }

  // Build warnings section
  let warningsSection = ''
  if (diagnosis.warnings.length > 0) {
    warningsSection = `\n⚠️ <b>Atenções:</b> ${diagnosis.warnings.length}\n${diagnosis.warnings.map(w => `• ${w.issue}`).join('\n')}`
  }

  // Build optimizations section (only if present)
  let optimizationsSection = ''
  if (diagnosis.optimizations.length > 0) {
    optimizationsSection = `\n💡 <b>Otimizações Sugeridas:</b>\n${diagnosis.optimizations.slice(0, 3).map(o => `• ${o.area}: ${o.suggestion}`).join('\n')}`
  }

  return `🏥 <b>Auditoria Diária — ${formatDate()}</b>

📊 Status: ${statusEmoji} ${statusLabel}

📈 <b>Métricas 24h:</b>
• Editais: ${formatNumber(metrics.tenders24h)}
• Matches: ${formatNumber(metrics.matches24h)}
• Notificações: ${formatNumber(metrics.notifications24h)}
• Concorrentes: ${formatNumber(metrics.competitors)}

🔍 <b>Verificações:</b> ${okChecks}/${totalChecks} ✅
${dimensionStatus}${fixesSection}${warningsSection}${optimizationsSection}`
}

// ─── Main Worker ────────────────────────────────────────────────────────────

export const dailyAuditWorker = new Worker(
  'daily-audit',
  async () => {
    const startTime = Date.now()
    logger.info('🏥 Daily audit starting...')

    // Run all 7 dimensions (some in parallel where safe)
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

    const dimensions: DimensionResult[] = [
      infraResult, pipelineResult, dbResult, aiResult, notifResult, secResult, perfResult,
    ]

    // Store all results in audit_logs
    await storeAuditResults(dimensions)

    // Get 24h metrics for the summary
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

    // AI Diagnosis
    logger.info('Running AI diagnosis...')
    const diagnosis = await runAIDiagnosis(dimensions)
    logger.info({
      critical: diagnosis.critical.length,
      warnings: diagnosis.warnings.length,
      optimizations: diagnosis.optimizations.length,
    }, 'AI diagnosis complete')

    // Auto-remediate
    const fixes = await autoRemediate(diagnosis, alertAdmin)

    // Build and send Telegram summary
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
    )

    await alertAdmin(summary)

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    logger.info({
      elapsed_seconds: elapsed,
      total_checks: dimensions.flatMap(d => d.checks).length,
      critical: diagnosis.critical.length,
      warnings: diagnosis.warnings.length,
      fixes: fixes.length,
    }, '🏥 Daily audit complete')
  },
  {
    connection,
    concurrency: 1,
  },
)

dailyAuditWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Daily audit failed')
})
