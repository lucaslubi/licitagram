/**
 * 🏥 AI-Powered Autonomous Healing System
 *
 * Runs every 10 minutes. Monitors infrastructure, detects issues,
 * fixes routine problems automatically, and asks admin for approval
 * on critical decisions via Telegram.
 *
 * Healing levels:
 *   AUTONOMOUS       — fix without asking (restart crashed worker, clear stuck queue, clean logs)
 *   APPROVAL_REQUIRED — ask admin via Telegram before acting (scale workers, change config, delete data)
 *   REPORT_ONLY      — just report, no action (unknown issues, performance trends)
 *
 * Flow:
 *   1. Collect system metrics (PM2, queues, RAM, CPU, disk)
 *   2. Rule-based detection (fast, no AI cost)
 *   3. AI analysis for complex/ambiguous issues (LLM)
 *   4. Execute autonomous actions or request approval
 *   5. Log everything to healing_actions table
 */
import { Worker, Queue, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'
import { callLLM, parseJsonResponse } from '../ai/llm-client'
import { sendHealingAlert, sendHealingReport } from '../lib/healing-telegram'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

const execAsync = promisify(exec)

const MEMORY_FILE = path.join(process.cwd(), 'healing-memory.json')

interface HealingMemory {
  runbook_rules: string[]
  last_consolidated: string
}

async function loadHealingMemory(): Promise<HealingMemory> {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const data = await fs.promises.readFile(MEMORY_FILE, 'utf-8')
      return JSON.parse(data)
    }
  } catch (err) {
    logger.error({ err }, 'Error loading healing memory')
  }
  return { runbook_rules: [], last_consolidated: '' }
}

async function saveHealingMemory(mem: HealingMemory) {
  try {
    await fs.promises.writeFile(MEMORY_FILE, JSON.stringify(mem, null, 2))
  } catch (err) {
    logger.error({ err }, 'Error saving healing memory')
  }
}


// ─── Types ──────────────────────────────────────────────────────────────────

type HealingSeverity = 'autonomous' | 'approval_required' | 'report_only'

interface DetectedIssue {
  action_type: string
  severity: HealingSeverity
  description: string
  details: Record<string, unknown>
  action_command?: string
  triggered_by: 'system' | 'ai' | 'admin'
}

interface PM2Process {
  name: string
  pm_id: number
  status: string
  cpu: number
  memory: number
  restarts: number
  uptime: number
}

interface SystemMetrics {
  pm2: PM2Process[]
  queues: Record<string, { waiting: number; active: number; failed: number; delayed: number }>
  ram: { total: number; used: number; available: number; percentUsed: number }
  cpu: { loadAvg1: number; loadAvg5: number; cores: number }
  disk: { total: string; used: string; available: string; percentUsed: number }
}

// ─── Metric Collection ──────────────────────────────────────────────────────

async function collectPM2Metrics(): Promise<PM2Process[]> {
  try {
    const { stdout } = await execAsync('pm2 jlist')
    const processes = JSON.parse(stdout) as Array<{
      name: string
      pm_id: number
      pm2_env: { status: string; restart_time: number; pm_uptime: number }
      monit: { cpu: number; memory: number }
    }>
    return processes.map(p => ({
      name: p.name,
      pm_id: p.pm_id,
      status: p.pm2_env.status,
      cpu: p.monit.cpu,
      memory: p.monit.memory,
      restarts: p.pm2_env.restart_time,
      uptime: p.pm2_env.pm_uptime,
    }))
  } catch (err) {
    logger.warn({ err }, 'Healing: failed to collect PM2 metrics')
    return []
  }
}

async function collectRAMMetrics(): Promise<SystemMetrics['ram']> {
  try {
    const { stdout } = await execAsync("free -b | awk '/^Mem:/ {print $2, $3, $7}'")
    const [total, used, available] = stdout.trim().split(/\s+/).map(Number)
    return { total, used, available, percentUsed: Math.round((used / total) * 100) }
  } catch {
    return { total: 0, used: 0, available: 0, percentUsed: 0 }
  }
}

async function collectCPUMetrics(): Promise<SystemMetrics['cpu']> {
  try {
    const { stdout: loadStr } = await execAsync("cat /proc/loadavg | awk '{print $1, $2}'")
    const [loadAvg1, loadAvg5] = loadStr.trim().split(/\s+/).map(Number)
    const { stdout: coresStr } = await execAsync('nproc')
    const cores = parseInt(coresStr.trim()) || 2
    return { loadAvg1, loadAvg5, cores }
  } catch {
    return { loadAvg1: 0, loadAvg5: 0, cores: 2 }
  }
}

async function collectDiskMetrics(): Promise<SystemMetrics['disk']> {
  try {
    const { stdout } = await execAsync("df -h / | tail -1 | awk '{print $2, $3, $4, $5}'")
    const [total, used, available, pct] = stdout.trim().split(/\s+/)
    return { total, used, available, percentUsed: parseInt(pct) || 0 }
  } catch {
    return { total: '0', used: '0', available: '0', percentUsed: 0 }
  }
}

const MONITORED_QUEUES = [
  'scraping', 'extraction', 'matching', 'notification', 'notification-whatsapp',
  'pending-notifications', 'hot-alerts', 'ai-triage', 'semantic-matching',
  'competition-analysis', 'results-scraping', 'fornecedor-enrichment',
  'contact-enrichment', 'proactive-supplier-scraping', 'ai-competitor-classifier',
  'competitor-relevance', 'map-cache', 'pipeline-health', 'daily-audit',
  'comprasgov-scraping', 'comprasgov-arp', 'comprasgov-legado', 'outcome-prompt',
  'certidoes',
]

async function collectQueueMetrics(): Promise<SystemMetrics['queues']> {
  const queues: SystemMetrics['queues'] = {}
  for (const name of MONITORED_QUEUES) {
    const q = new Queue(name, { connection })
    try {
      const [waiting, active, failed, delayed] = await Promise.all([
        q.getWaitingCount(),
        q.getActiveCount(),
        q.getFailedCount(),
        q.getDelayedCount(),
      ])
      queues[name] = { waiting, active, failed, delayed }
    } catch {
      // Queue may not exist yet
    } finally {
      await q.close()
    }
  }
  return queues
}

async function collectAllMetrics(): Promise<SystemMetrics> {
  const [pm2, queues, ram, cpu, disk] = await Promise.all([
    collectPM2Metrics(),
    collectQueueMetrics(),
    collectRAMMetrics(),
    collectCPUMetrics(),
    collectDiskMetrics(),
  ])
  return { pm2, queues, ram, cpu, disk }
}

// ─── Business Logic Health Checks ────────────────────────────────────────────

interface BusinessMetrics {
  notificationsSent2h: number
  pendingMatchesOlderThan30d: number
  repeatableJobsRegistered: string[]
  matchesCreated24h: number
}

const REQUIRED_REPEATABLE_JOBS = [
  'pending-notifications-5min',
  'hot-scan-30m-repeat',
  'urgency-check-repeat',
  'new-matches-digest-3h-repeat',
]

async function collectBusinessMetrics(): Promise<BusinessMetrics> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [notifResult, staleResult, matchesResult] = await Promise.all([
    // Notifications sent in last 2h
    supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .gte('notified_at', twoHoursAgo),
    // Pending matches older than 30 days that are still 'new' + not notified
    supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new')
      .is('notified_at', null)
      .lt('created_at', thirtyDaysAgo),
    // Matches created in last 24h
    supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', oneDayAgo),
  ])

  // Check which repeatable jobs are registered in BullMQ
  const registeredJobs: string[] = []
  for (const queueName of ['pending-notifications', 'hot-alerts']) {
    const q = new Queue(queueName, { connection })
    try {
      const repeatable = await q.getRepeatableJobs()
      for (const job of repeatable) {
        if (job.id) registeredJobs.push(job.id)
        else if (job.key) registeredJobs.push(job.key)
      }
    } catch { /* queue may not exist */ }
    finally { await q.close() }
  }

  return {
    notificationsSent2h: notifResult.count ?? 0,
    pendingMatchesOlderThan30d: staleResult.count ?? 0,
    repeatableJobsRegistered: registeredJobs,
    matchesCreated24h: matchesResult.count ?? 0,
  }
}

async function detectBusinessIssues(): Promise<DetectedIssue[]> {
  const issues: DetectedIssue[] = []
  const biz = await collectBusinessMetrics()

  // --- Missing repeatable jobs (CRITICAL — notifications will stop entirely) ---
  const missingJobs = REQUIRED_REPEATABLE_JOBS.filter(
    jobId => !biz.repeatableJobsRegistered.some(r => r.includes(jobId))
  )
  if (missingJobs.length > 0) {
    issues.push({
      action_type: 'reregister_notification_jobs',
      severity: 'autonomous',
      description: `Jobs repeatable de notificação ausentes no BullMQ: ${missingJobs.join(', ')}. Re-registrando automaticamente.`,
      details: { missingJobs, registeredJobs: biz.repeatableJobsRegistered },
      triggered_by: 'system',
    })
  }

  // --- No notifications sent in 2h (with active matches being created) ---
  if (biz.notificationsSent2h === 0 && biz.matchesCreated24h > 0 && missingJobs.length === 0) {
    issues.push({
      action_type: 'notification_throughput_zero',
      severity: 'approval_required',
      description: `Nenhuma notificação enviada nas últimas 2h, mas ${biz.matchesCreated24h} matches criados em 24h. Possível problema no pipeline de notificações.`,
      details: { notificationsSent2h: biz.notificationsSent2h, matchesCreated24h: biz.matchesCreated24h },
      triggered_by: 'system',
    })
  }

  // --- Stale unnotified matches (data hygiene) ---
  if (biz.pendingMatchesOlderThan30d > 100) {
    issues.push({
      action_type: 'clean_stale_matches',
      severity: 'autonomous',
      description: `${biz.pendingMatchesOlderThan30d.toLocaleString()} matches com 30+ dias ainda "new" e sem notificação. Marcando como "dismissed" para limpeza.`,
      details: { count: biz.pendingMatchesOlderThan30d },
      triggered_by: 'system',
    })
  }

  return issues
}

async function executeBusinessAction(issue: DetectedIssue): Promise<{ success: boolean; result: string }> {
  switch (issue.action_type) {
    case 'reregister_notification_jobs': {
      try {
        const { pendingNotificationsQueue } = await import('../queues/pending-notifications.queue')
        const { hotAlertsQueue } = await import('../queues/hot-alerts.queue')

        await pendingNotificationsQueue.add('check-pending', {}, {
          repeat: { every: 5 * 60 * 1000 },
          jobId: 'pending-notifications-5min',
        })
        await hotAlertsQueue.add('hot-daily', {}, {
          repeat: { every: 30 * 60 * 1000 },
          jobId: 'hot-scan-30m-repeat',
        })
        await hotAlertsQueue.add('urgency-check', {}, {
          repeat: { every: 60 * 60 * 1000 },
          jobId: 'urgency-check-repeat',
        })
        await hotAlertsQueue.add('new-matches-digest', {}, {
          repeat: { every: 3 * 60 * 60 * 1000 },
          jobId: 'new-matches-digest-3h-repeat',
        })
        return { success: true, result: 'Jobs repeatable de notificação re-registrados com sucesso' }
      } catch (err) {
        return { success: false, result: `Erro ao re-registrar jobs: ${(err as Error).message}` }
      }
    }

    case 'clean_stale_matches': {
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        const { count, error } = await supabase
          .from('matches')
          .update({ status: 'dismissed' })
          .eq('status', 'new')
          .is('notified_at', null)
          .lt('created_at', thirtyDaysAgo)
          .select('id')

        if (error) throw error
        return { success: true, result: `${count ?? 0} matches antigos marcados como dismissed` }
      } catch (err) {
        return { success: false, result: `Erro ao limpar matches: ${(err as Error).message}` }
      }
    }

    default:
      return { success: false, result: `Business action "${issue.action_type}" sem handler` }
  }
}

// ─── Rule-Based Detection ───────────────────────────────────────────────────

function detectIssuesFromRules(metrics: SystemMetrics): DetectedIssue[] {
  const issues: DetectedIssue[] = []

  // --- PM2 Worker issues ---
  for (const proc of metrics.pm2) {
    // Crashed worker
    if (proc.status !== 'online') {
      issues.push({
        action_type: 'restart_worker',
        severity: 'autonomous',
        description: `Worker "${proc.name}" está ${proc.status}. Reiniciando automaticamente.`,
        details: { worker: proc.name, status: proc.status, pm_id: proc.pm_id },
        action_command: `pm2 restart ${proc.name}`,
        triggered_by: 'system',
      })
    }

    // High restart count (> 10 restarts AND uptime < 1h = restart loop)
    if (proc.restarts > 10 && proc.uptime < 60 * 60 * 1000) {
      issues.push({
        action_type: 'restart_worker',
        severity: 'autonomous',
        description: `Worker "${proc.name}" reiniciou ${proc.restarts}x na última hora. Reiniciando.`,
        details: { worker: proc.name, restarts: proc.restarts, uptime: proc.uptime },
        action_command: `pm2 restart ${proc.name}`,
        triggered_by: 'system',
      })
    }

    // Single worker using > 500MB RAM
    if (proc.memory > 500 * 1024 * 1024) {
      issues.push({
        action_type: 'restart_worker',
        severity: 'autonomous',
        description: `Worker "${proc.name}" usando ${Math.round(proc.memory / 1024 / 1024)}MB RAM. Reiniciando para liberar memória.`,
        details: { worker: proc.name, memoryMB: Math.round(proc.memory / 1024 / 1024) },
        action_command: `pm2 restart ${proc.name}`,
        triggered_by: 'system',
      })
    }
  }

  // --- Queue backlogs ---
  for (const [queueName, stats] of Object.entries(metrics.queues)) {
    // Large backlog with no active workers = stuck
    if (stats.waiting > 5000 && stats.active === 0) {
      if (stats.waiting > 20000) {
        issues.push({
          action_type: 'scale_workers',
          severity: 'approval_required',
          description: `Fila "${queueName}" tem ${stats.waiting.toLocaleString()} jobs parados sem workers ativos. Escalar workers?`,
          details: { queue: queueName, waiting: stats.waiting, active: stats.active },
          triggered_by: 'system',
        })
      } else {
        issues.push({
          action_type: 'restart_queue_worker',
          severity: 'autonomous',
          description: `Fila "${queueName}" tem ${stats.waiting.toLocaleString()} jobs e 0 active. Reiniciando worker responsável.`,
          details: { queue: queueName, waiting: stats.waiting },
          action_command: getRestartCommandForQueue(queueName),
          triggered_by: 'system',
        })
      }
    }

    // Backlog enorme MAS com workers ativos = processamento lento.
    // Auto-scale concurrency via env var + pm2 reload. Limitado aos
    // workers escaláveis (ai-triage é o principal).
    if (
      stats.waiting > 10_000 &&
      stats.active > 0 &&
      isScalableQueue(queueName)
    ) {
      issues.push({
        action_type: 'autoscale_concurrency',
        severity: 'autonomous',
        description: `Fila "${queueName}" com ${stats.waiting.toLocaleString()} waiting + ${stats.active} active. Escalando concurrency.`,
        details: { queue: queueName, waiting: stats.waiting, active: stats.active },
        action_command: getScaleCommandForQueue(queueName, stats.waiting),
        triggered_by: 'system',
      })
    }

    // Excessive failed jobs
    if (stats.failed > 500) {
      issues.push({
        action_type: 'clean_failed_jobs',
        severity: 'autonomous',
        description: `Fila "${queueName}" tem ${stats.failed} jobs falhados. Limpando jobs antigos.`,
        details: { queue: queueName, failed: stats.failed },
        triggered_by: 'system',
      })
    }
  }

  // --- RAM ---
  if (metrics.ram.percentUsed > 95) {
    issues.push({
      action_type: 'critical_ram',
      severity: 'approval_required',
      description: `RAM crítica: ${metrics.ram.percentUsed}% usado (${Math.round(metrics.ram.available / 1024 / 1024)}MB livre). Matar workers não essenciais?`,
      details: { percentUsed: metrics.ram.percentUsed, availableMB: Math.round(metrics.ram.available / 1024 / 1024) },
      triggered_by: 'system',
    })
  } else if (metrics.ram.percentUsed > 85) {
    // Find the highest-memory PM2 process and restart it
    const highestMem = [...metrics.pm2].sort((a, b) => b.memory - a.memory)[0]
    if (highestMem) {
      issues.push({
        action_type: 'restart_worker',
        severity: 'autonomous',
        description: `RAM alta: ${metrics.ram.percentUsed}%. Reiniciando "${highestMem.name}" (${Math.round(highestMem.memory / 1024 / 1024)}MB) para liberar memória.`,
        details: { percentUsed: metrics.ram.percentUsed, worker: highestMem.name, memoryMB: Math.round(highestMem.memory / 1024 / 1024) },
        action_command: `pm2 restart ${highestMem.name}`,
        triggered_by: 'system',
      })
    }
  }

  // --- Disk ---
  if (metrics.disk.percentUsed > 95) {
    issues.push({
      action_type: 'critical_disk',
      severity: 'approval_required',
      description: `Disco crítico: ${metrics.disk.percentUsed}% usado (${metrics.disk.available} livre). Limpar dados antigos?`,
      details: { percentUsed: metrics.disk.percentUsed, available: metrics.disk.available },
      triggered_by: 'system',
    })
  } else if (metrics.disk.percentUsed > 80) {
    issues.push({
      action_type: 'clean_logs',
      severity: 'autonomous',
      description: `Disco ${metrics.disk.percentUsed}% usado. Limpando logs antigos e arquivos temporários.`,
      details: { percentUsed: metrics.disk.percentUsed, available: metrics.disk.available },
      action_command: 'find /root/.pm2/logs -name "*.log" -mtime +3 -delete && pm2 flush',
      triggered_by: 'system',
    })
  }

  // --- CPU ---
  const cpuThreshold = metrics.cpu.cores * 1.5
  if (metrics.cpu.loadAvg1 > cpuThreshold) {
    issues.push({
      action_type: 'high_cpu',
      severity: 'report_only',
      description: `CPU alta: load ${metrics.cpu.loadAvg1.toFixed(1)} (${metrics.cpu.cores} cores). Monitorando.`,
      details: { loadAvg1: metrics.cpu.loadAvg1, loadAvg5: metrics.cpu.loadAvg5, cores: metrics.cpu.cores },
      triggered_by: 'system',
    })
  }

  return issues
}

/**
 * Filas que suportam escalar concurrency via env var sem redeploy.
 * Cada uma tem uma variável CONCURRENCY_* lida pelo processor no boot.
 */
function isScalableQueue(queueName: string): boolean {
  return ['ai-triage', 'semantic-matching', 'extraction'].includes(queueName)
}

/**
 * Gera comando PM2 pra aumentar concurrency de um worker escalável.
 * Usa pm2 set + restart --update-env pra aplicar sem downtime significativo.
 *
 * Estratégia de escalonamento progressivo:
 *   < 20K waiting  → concurrency 8
 *   < 50K waiting  → concurrency 12
 *   ≥ 50K waiting  → concurrency 16 (teto — multi-key OpenRouter limit)
 */
function getScaleCommandForQueue(queueName: string, waiting: number): string {
  const newConcurrency = waiting >= 50_000 ? 16 : waiting >= 20_000 ? 12 : 8

  const ENV_VAR_MAP: Record<string, { envKey: string; pm2Name: string }> = {
    'ai-triage': { envKey: 'CONCURRENCY_AI_TRIAGE', pm2Name: 'worker-matching' },
    'semantic-matching': { envKey: 'CONCURRENCY_SEMANTIC', pm2Name: 'worker-matching' },
    'extraction': { envKey: 'CONCURRENCY_EXTRACTION', pm2Name: 'worker-extraction' },
  }
  const cfg = ENV_VAR_MAP[queueName]
  if (!cfg) return `echo "queue ${queueName} not scalable"`

  return `pm2 set ${cfg.envKey} ${newConcurrency} && pm2 restart ${cfg.pm2Name} --update-env`
}

// Map queue names to PM2 worker restart commands
function getRestartCommandForQueue(queueName: string): string {
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
    'daily-audit': 'worker-alerts',
    'competition-analysis': 'worker-enrichment',
    'results-scraping': 'worker-enrichment',
    'fornecedor-enrichment': 'worker-enrichment',
    'contact-enrichment': 'worker-enrichment',
    'proactive-supplier-scraping': 'worker-enrichment',
    'ai-competitor-classifier': 'worker-enrichment',
    'competitor-relevance': 'worker-enrichment',
  }
  const workerName = WORKER_MAP[queueName] || 'worker-alerts'
  return `pm2 restart ${workerName}`
}

// ─── AI Analysis (for complex issues rules can't handle) ────────────────────

async function runAIAnalysis(metrics: SystemMetrics, recentActions: Record<string, unknown>[]): Promise<DetectedIssue[]> {
  try {
    const memory = await loadHealingMemory()
    const memoryContext = memory.runbook_rules.length > 0 
      ? `\n\nMemória de Cura (Regras Históricas Aprendidas):\n${memory.runbook_rules.map(r => '- ' + r).join('\n')}` 
      : ''

    // Build a compact summary to minimize token usage
    const metricsSummary = {
      pm2: metrics.pm2.map(p => ({
        name: p.name, status: p.status, cpu: p.cpu,
        memMB: Math.round(p.memory / 1024 / 1024), restarts: p.restarts,
      })),
      queues: Object.fromEntries(
        Object.entries(metrics.queues).filter(([, s]) => s.waiting > 0 || s.failed > 0),
      ),
      ram: { pct: metrics.ram.percentUsed, freeMB: Math.round(metrics.ram.available / 1024 / 1024) },
      cpu: { load1: metrics.cpu.loadAvg1, cores: metrics.cpu.cores },
      disk: { pct: metrics.disk.percentUsed, free: metrics.disk.available },
    }

    const response = await callLLM({
      task: 'classification',
      system: `Você é um engenheiro de infraestrutura analisando o sistema Licitagram.
Analise as métricas e identifique problemas que regras simples não detectariam:
- Padrões de degradação progressiva
- Correlações entre métricas (ex: RAM alta + filas crescendo = leak)
- Anomalias sutis
${memoryContext}

Responda APENAS em JSON válido:
{
  "issues": [
    {
      "action_type": "string (ex: investigate_memory_leak, optimize_batching, etc)",
      "severity": "autonomous | approval_required | report_only",
      "description": "string em português",
      "autonomous": boolean
    }
  ]
}

Se não houver problemas além dos óbvios, retorne { "issues": [] }.
NÃO repita problemas que regras simples já detectam (worker crashed, RAM > 85%, etc).`,
      prompt: `Métricas atuais:\n${JSON.stringify(metricsSummary, null, 2)}\n\nÚltimas ações de healing:\n${JSON.stringify(recentActions.slice(0, 10), null, 2)}`,
      maxRetries: 1,
      jsonMode: true,
    })

    const parsed = parseJsonResponse<{
      issues: Array<{
        action_type: string
        severity: HealingSeverity
        description: string
        autonomous?: boolean
      }>
    }>(response)

    return (parsed.issues || []).map(issue => ({
      action_type: issue.action_type,
      severity: issue.severity || 'report_only',
      description: issue.description,
      details: { aiGenerated: true },
      triggered_by: 'ai' as const,
    }))
  } catch (err) {
    logger.warn({ err }, 'Healing: AI analysis failed (non-critical)')
    return []
  }
}

// ─── Action Execution ───────────────────────────────────────────────────────

async function executeAction(issue: DetectedIssue): Promise<{ success: boolean; result: string }> {
  // Special handling by action type
  switch (issue.action_type) {
    case 'clean_failed_jobs': {
      const queueName = (issue.details.queue as string) || ''
      try {
        const q = new Queue(queueName, { connection })
        const failedJobs = await q.getFailed(0, 500)
        let cleaned = 0
        for (const job of failedJobs) {
          const age = Date.now() - (job.finishedOn || 0)
          if (age > 12 * 60 * 60 * 1000) {
            await job.remove()
            cleaned++
          }
        }
        return { success: true, result: `Removidos ${cleaned} jobs falhados da fila ${queueName}` }
      } catch (err) {
        return { success: false, result: `Erro ao limpar jobs: ${(err as Error).message}` }
      }
    }

    case 'restart_worker':
    case 'restart_queue_worker':
    case 'clean_logs':
    case 'autoscale_concurrency': {
      if (!issue.action_command) return { success: false, result: 'Sem comando definido' }
      try {
        const { stdout, stderr } = await execAsync(issue.action_command)
        return { success: true, result: stdout || stderr || 'Comando executado com sucesso' }
      } catch (err) {
        return { success: false, result: `Erro: ${(err as Error).message}` }
      }
    }

    case 'critical_ram': {
      // Kill non-essential workers (enrichment first)
      try {
        await execAsync('pm2 stop worker-enrichment')
        return { success: true, result: 'Worker-enrichment parado para liberar RAM' }
      } catch (err) {
        return { success: false, result: `Erro: ${(err as Error).message}` }
      }
    }

    case 'critical_disk': {
      try {
        await execAsync('find /root/.pm2/logs -name "*.log" -mtime +1 -delete && pm2 flush')
        // Clean old system_metrics (older than 30 days)
        await supabase
          .from('system_metrics')
          .delete()
          .lt('recorded_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        return { success: true, result: 'Logs limpos e métricas antigas removidas' }
      } catch (err) {
        return { success: false, result: `Erro: ${(err as Error).message}` }
      }
    }

    case 'scale_workers': {
      // Scale up by adding more PM2 instances
      const queueName = (issue.details.queue as string) || ''
      const workerCommand = getRestartCommandForQueue(queueName).replace('restart', 'scale')
      try {
        // Start a new instance instead of scaling (PM2 cluster mode isn't used)
        const pmName = workerCommand.split(' ').pop() || ''
        await execAsync(`pm2 restart ${pmName}`)
        return { success: true, result: `Worker ${pmName} reiniciado para processar backlog` }
      } catch (err) {
        return { success: false, result: `Erro: ${(err as Error).message}` }
      }
    }

    default:
      return { success: false, result: `Tipo de ação "${issue.action_type}" não tem handler definido` }
  }
}

// ─── Logging to Supabase ────────────────────────────────────────────────────

async function logHealingAction(
  issue: DetectedIssue,
  status: string,
  result: string | null,
  telegramMessageId: string | null,
): Promise<number> {
  const { data, error } = await supabase
    .from('healing_actions')
    .insert({
      action_type: issue.action_type,
      severity: issue.severity,
      description: issue.description,
      details: issue.details,
      status,
      result,
      triggered_by: issue.triggered_by,
      telegram_message_id: telegramMessageId,
      executed_at: status === 'executed' ? new Date().toISOString() : null,
    })
    .select('id')
    .single()

  if (error) {
    logger.error({ error }, 'Healing: failed to log action to Supabase')
    return 0
  }
  return data?.id || 0
}

// ─── Daily Report ───────────────────────────────────────────────────────────

async function generateDailyReport() {
  logger.info('📊 Generating daily healing report...')

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Fetch last 24h of healing actions
  const { data: actions } = await supabase
    .from('healing_actions')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  const allActions = (actions || []) as Record<string, unknown>[]

  // Pipeline stats
  const [tendersResult, matchesResult, notificationsResult] = await Promise.all([
    supabase.from('tenders').select('id', { count: 'exact', head: true }).gte('created_at', since),
    supabase.from('matches').select('id', { count: 'exact', head: true }).gte('created_at', since),
    supabase.from('notification_logs').select('id', { count: 'exact', head: true }).gte('created_at', since),
  ])
  const pipelineStats = {
    editais: tendersResult.count ?? 0,
    matches: matchesResult.count ?? 0,
    notificacoes: notificationsResult.count ?? 0,
  }

  // System status
  const metrics = await collectAllMetrics()
  const onlineWorkers = metrics.pm2.filter(p => p.status === 'online').length

  const now = new Date()
  const dateStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  // Categorize actions
  const autonomousActions = allActions.filter(a => a.severity === 'autonomous' && a.status === 'executed')
  const pendingActions = allActions.filter(a => a.status === 'pending')
  const failedActions = allActions.filter(a => a.status === 'failed')

  let report = `🏥 <b>Relatório de Saúde — Licitagram</b>\n`
  report += `📅 ${dateStr}\n\n`

  report += `📊 <b>Métricas 24h</b>\n`
  report += `• Editais processados: ${pipelineStats.editais.toLocaleString()}\n`
  report += `• Matches gerados: ${pipelineStats.matches.toLocaleString()}\n`
  report += `• Notificações enviadas: ${pipelineStats.notificacoes.toLocaleString()}\n`
  report += `• Workers: ${onlineWorkers}/${metrics.pm2.length} online\n`
  report += `• RAM: ${metrics.ram.percentUsed}% | Disco: ${metrics.disk.percentUsed}%\n\n`

  report += `🔧 <b>Ações Autônomas: ${autonomousActions.length}</b>\n`
  if (autonomousActions.length > 0) {
    for (const a of autonomousActions.slice(0, 10)) {
      report += `✅ ${a.description}\n`
    }
    if (autonomousActions.length > 10) {
      report += `<i>... e mais ${autonomousActions.length - 10} ações</i>\n`
    }
  } else {
    report += `<i>Nenhuma ação necessária</i>\n`
  }
  report += '\n'

  if (pendingActions.length > 0) {
    report += `⚠️ <b>Pendente de Aprovação: ${pendingActions.length}</b>\n`
    for (const a of pendingActions) {
      report += `⏳ ${a.description}\n`
    }
    report += '\n'
  }

  if (failedActions.length > 0) {
    report += `❌ <b>Ações Falhadas: ${failedActions.length}</b>\n`
    for (const a of failedActions.slice(0, 5)) {
      report += `• ${a.action_type}: ${a.result || 'sem detalhes'}\n`
    }
    report += '\n'
  }

  // Memory Consolidation Phase
  let memoryStatsStr = ''
  try {
    const memory = await loadHealingMemory()
    const memoryPrompt = `Memória Atual:\n${JSON.stringify(memory.runbook_rules)}\n\nAções Sistêmicas e IAs nas últimas 24h:\n${JSON.stringify(allActions.slice(0, 30).map(a => ({ type: a.action_type, desc: a.description, status: a.status }))) }`
    
    const consolidationResponse = await callLLM({
      task: 'summary',
      system: `Você é o Arquivista do sistema de Auto Healing.
Atualize a Memória de Curas (Runbook) para que o agente primário aprenda o que funcionou falhou e não repita os mesmos erros.
Mantenha as regras anteriores (se úteis), descarte irrelevantes, e adicione os aprendizados das últimas 24h. Limite a 15 regras.
Responda APENAS JSON: { "runbook_rules": ["Regra 1...", "Regra 2..."] }`,
      prompt: memoryPrompt,
      maxRetries: 1,
      jsonMode: true,
    })
    
    const parsedMemory = parseJsonResponse<{ runbook_rules: string[] }>(consolidationResponse)
    if (parsedMemory && parsedMemory.runbook_rules) {
      memory.runbook_rules = parsedMemory.runbook_rules.slice(0, 15)
      memory.last_consolidated = new Date().toISOString()
      await saveHealingMemory(memory)
      memoryStatsStr = `📘 <b>Memória de Auto-Cura Evoluída:</b> ${memory.runbook_rules.length} regras consolidadas com sucesso.`
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to consolidate healing memory')
  }

  // AI trend analysis
  try {
    const aiSummary = await callLLM({
      task: 'summary',
      system: `Você é um engenheiro DevOps analisando o sistema Licitagram.
Gere uma análise curta (3-5 linhas) com:
1. Estado geral do sistema
2. Tendências observadas
3. 1-2 sugestões de próximas ações

Responda em texto puro (sem markdown, sem JSON). Seja conciso e direto.`,
      prompt: `Ações de healing (24h): ${JSON.stringify(allActions.slice(0, 20).map(a => ({
        type: a.action_type, severity: a.severity, desc: a.description, status: a.status,
      })))}
Pipeline: ${JSON.stringify(pipelineStats)}
RAM: ${metrics.ram.percentUsed}%, Disco: ${metrics.disk.percentUsed}%, Workers: ${onlineWorkers}/${metrics.pm2.length}`,
      maxRetries: 1,
    })
    report += `🧠 <b>Análise IA</b>\n${aiSummary.trim()}\n\n`
    if (memoryStatsStr) report += `${memoryStatsStr}\n`
  } catch {
    report += `🧠 <b>Análise IA</b>\n<i>Análise indisponível</i>\n\n`
    if (memoryStatsStr) report += `${memoryStatsStr}\n`
  }

  await sendHealingReport(report)
  logger.info({ autonomousActions: autonomousActions.length, pipelineStats }, 'Daily healing report sent')
}

// ─── Main Processor ─────────────────────────────────────────────────────────

async function processHealing(job: Job) {
  // Route by job name
  if (job.name === 'daily-report') {
    return generateDailyReport()
  }

  // Default: health check (runs every 10 min)
  const startTime = Date.now()
  logger.info('🏥 Healing check starting...')

  // Step 1: Collect metrics
  const metrics = await collectAllMetrics()
  logger.info({
    pm2Count: metrics.pm2.length,
    queueCount: Object.keys(metrics.queues).length,
    ramPct: metrics.ram.percentUsed,
    diskPct: metrics.disk.percentUsed,
    cpuLoad: metrics.cpu.loadAvg1,
  }, 'Healing: metrics collected')

  // Step 2: Rule-based detection (infrastructure)
  const ruleIssues = detectIssuesFromRules(metrics)

  // Step 2b: Business logic health checks (notification pipeline, stale data)
  let businessIssues: DetectedIssue[] = []
  try {
    businessIssues = await detectBusinessIssues()
    if (businessIssues.length > 0) {
      logger.info({ businessIssueCount: businessIssues.length }, 'Healing: business logic issues detected')
    }
  } catch (err) {
    logger.warn({ err }, 'Healing: business logic checks failed (non-critical)')
  }

  // Step 3: AI analysis (only if no critical rule-based issues to save costs)
  let aiIssues: DetectedIssue[] = []
  const hasCriticalRuleIssues = [...ruleIssues, ...businessIssues].some(i => i.severity === 'approval_required')
  if (!hasCriticalRuleIssues) {
    // Fetch recent actions for context
    const { data: recentActions } = await supabase
      .from('healing_actions')
      .select('action_type, severity, description, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10)

    aiIssues = await runAIAnalysis(metrics, (recentActions || []) as Record<string, unknown>[])
  }

  const allIssues = [...ruleIssues, ...businessIssues, ...aiIssues]

  if (allIssues.length === 0) {
    logger.info({ durationMs: Date.now() - startTime }, 'Healing: no issues detected')
    return { status: 'healthy', issues: 0 }
  }

  logger.info({ issueCount: allIssues.length }, 'Healing: issues detected, processing...')

  let autonomous = 0
  let approvalRequired = 0
  let reportOnly = 0

  for (const issue of allIssues) {
    switch (issue.severity) {
      case 'autonomous': {
        // Execute immediately — try business actions first, then infra actions
        const isBusinessAction = ['reregister_notification_jobs', 'clean_stale_matches', 'notification_throughput_zero'].includes(issue.action_type)
        const { success, result } = isBusinessAction
          ? await executeBusinessAction(issue)
          : await executeAction(issue)
        const status = success ? 'executed' : 'failed'
        await logHealingAction(issue, status, result, null)

        // Send notification (no approval needed)
        const emoji = success ? '✅' : '❌'
        await sendHealingAlert(
          `${emoji} <b>Ação Autônoma</b>\n\n${issue.description}\n\n<i>Resultado: ${result}</i>`,
          0,
          false,
        )
        autonomous++
        logger.info({ actionType: issue.action_type, success, result }, 'Healing: autonomous action')
        break
      }

      case 'approval_required': {
        // Log as pending, send Telegram with approval buttons
        const actionId = await logHealingAction(issue, 'pending', null, null)
        if (actionId > 0) {
          const msgId = await sendHealingAlert(
            `🔔 <b>Aprovação Necessária</b>\n\n${issue.description}\n\n<i>Ação: ${issue.action_type}</i>\n<i>ID: #${actionId}</i>`,
            actionId,
            true,
          )
          // Update with telegram message ID for tracking
          if (msgId) {
            await supabase
              .from('healing_actions')
              .update({ telegram_message_id: msgId })
              .eq('id', actionId)
          }
        }
        approvalRequired++
        logger.info({ actionType: issue.action_type, actionId }, 'Healing: approval requested')
        break
      }

      case 'report_only': {
        await logHealingAction(issue, 'executed', issue.description, null)
        reportOnly++
        logger.info({ actionType: issue.action_type }, 'Healing: report-only issue logged')
        break
      }
    }
  }

  const summary = {
    status: 'processed',
    total: allIssues.length,
    autonomous,
    approvalRequired,
    reportOnly,
    durationMs: Date.now() - startTime,
  }

  logger.info(summary, 'Healing check complete')
  return summary
}

// ─── Approval Handler (called from Telegram bot callback) ───────────────────

export async function executeHealingApproval(actionId: number, approved: boolean): Promise<string> {
  const { data: action, error } = await supabase
    .from('healing_actions')
    .select('*')
    .eq('id', actionId)
    .single()

  if (error || !action) {
    return `Ação #${actionId} não encontrada.`
  }

  if (action.status !== 'pending') {
    return `Ação #${actionId} já foi ${action.status}.`
  }

  if (!approved) {
    await supabase
      .from('healing_actions')
      .update({ status: 'rejected', executed_at: new Date().toISOString() })
      .eq('id', actionId)
    return `Ação #${actionId} rejeitada.`
  }

  // Execute the approved action
  const issue: DetectedIssue = {
    action_type: action.action_type,
    severity: action.severity,
    description: action.description,
    details: action.details || {},
    action_command: action.details?.action_command as string | undefined,
    triggered_by: 'admin',
  }

  const { success, result } = await executeAction(issue)

  await supabase
    .from('healing_actions')
    .update({
      status: success ? 'executed' : 'failed',
      result,
      triggered_by: 'admin',
      executed_at: new Date().toISOString(),
    })
    .eq('id', actionId)

  return success
    ? `✅ Ação #${actionId} executada: ${result}`
    : `❌ Ação #${actionId} falhou: ${result}`
}

// ─── Worker ─────────────────────────────────────────────────────────────────

export const aiHealingWorker = new Worker(
  'ai-healing',
  processHealing,
  {
    connection,
    concurrency: 1,
    limiter: { max: 1, duration: 5 * 60 * 1000 }, // At most 1 run per 5 min
    lockDuration: 600_000,
    stalledInterval: 600_000,
  },
)

aiHealingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Healing processor failed')
})

aiHealingWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Healing check completed')
})
