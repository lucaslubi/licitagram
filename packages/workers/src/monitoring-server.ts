import 'dotenv/config'
import * as http from 'http'
import * as os from 'os'
import { execFileSync } from 'child_process'
import IORedis from 'ioredis'
import { db as supabase } from './lib/db'

// ── Config ───────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.MONITORING_PORT || '3998', 10)
const API_KEY = process.env.MONITORING_API_KEY || ''
const METRICS_RECORD_INTERVAL = 5 * 60 * 1000 // 5 minutes
const METRICS_RETENTION_DAYS = 7

const QUEUE_NAMES = [
  'extraction',
  'semantic-matching',
  'scraping',
  'notification',
  'enrichment',
  'matching',
  'ai-triage',
  'competition-analysis',
  'hot-alerts',
  'map-cache',
]

// Only allow alphanumeric, dash, underscore for process names
const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/

// ── Redis ────────────────────────────────────────────────────────────────────
let redis: IORedis | null = null

function getRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })
    redis.on('error', (err) => {
      console.error('[monitoring] Redis error:', err.message)
    })
  }
  return redis
}

// ── Auth middleware ──────────────────────────────────────────────────────────
function isAuthorized(req: http.IncomingMessage): boolean {
  if (!API_KEY) return true // no key configured = allow all
  const auth = req.headers.authorization
  if (!auth) return false
  const [scheme, token] = auth.split(' ')
  return scheme === 'Bearer' && token === API_KEY
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function execSafe(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { timeout: 10_000, encoding: 'utf8' })
  } catch {
    return ''
  }
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// ── Data collectors ─────────────────────────────────────────────────────────

interface WorkerInfo {
  name: string
  pid: number
  memory: number
  cpu: number
  uptime: string
  restarts: number
  status: 'online' | 'stopping' | 'stopped' | 'errored' | 'launching'
}

function getWorkers(): WorkerInfo[] {
  const raw = execSafe('pm2', ['jlist'])
  if (!raw) return []
  try {
    const procs = JSON.parse(raw)
    return procs.map((p: any) => ({
      name: p.name,
      pid: p.pid,
      memory: Math.round((p.monit?.memory || 0) / 1024 / 1024),
      cpu: p.monit?.cpu || 0,
      uptime: formatUptime(
        p.pm2_env?.pm_uptime
          ? Math.floor((Date.now() - p.pm2_env.pm_uptime) / 1000)
          : 0,
      ),
      restarts: p.pm2_env?.restart_time || 0,
      status: p.pm2_env?.status || 'stopped',
    }))
  } catch {
    return []
  }
}

interface QueueStats {
  wait: number
  active: number
  completed: number
  failed: number
  delayed: number
}

async function getQueues(): Promise<Record<string, QueueStats>> {
  const r = getRedis()
  const result: Record<string, QueueStats> = {}

  await Promise.all(
    QUEUE_NAMES.map(async (name) => {
      const prefix = `bull:${name}`
      const [wait, active, completed, failed, delayed] = await Promise.all([
        r.llen(`${prefix}:wait`).catch(() => 0),
        r.llen(`${prefix}:active`).catch(() => 0),
        r.scard(`${prefix}:completed`).catch(() => 0),
        r.scard(`${prefix}:failed`).catch(() => 0),
        r.zcard(`${prefix}:delayed`).catch(() => 0),
      ])
      result[name] = { wait, active, completed, failed, delayed }
    }),
  )

  return result
}

interface VpsInfo {
  ram_total_mb: number
  ram_used_mb: number
  ram_free_mb: number
  cpu_load: number[]
  cpu_count: number
  disk_total_gb: number
  disk_used_gb: number
  disk_used_pct: number
  uptime_hours: number
}

function getVps(): VpsInfo {
  const totalMem = Math.round(os.totalmem() / 1024 / 1024)
  const freeMem = Math.round(os.freemem() / 1024 / 1024)

  // Disk info from df
  let diskTotal = 0
  let diskUsed = 0
  let diskPct = 0
  const dfOutput = execSafe('df', ['-k', '/'])
  if (dfOutput) {
    const lines = dfOutput.trim().split('\n')
    if (lines.length >= 2) {
      const parts = lines[1].trim().split(/\s+/)
      if (parts.length >= 5) {
        diskTotal = Math.round(parseInt(parts[1], 10) / 1024 / 1024) // KB -> GB
        diskUsed = Math.round(parseInt(parts[2], 10) / 1024 / 1024)
        diskPct = parseInt(parts[4].replace('%', ''), 10)
      }
    }
  }

  return {
    ram_total_mb: totalMem,
    ram_used_mb: totalMem - freeMem,
    ram_free_mb: freeMem,
    cpu_load: os.loadavg(),
    cpu_count: os.cpus().length,
    disk_total_gb: diskTotal,
    disk_used_gb: diskUsed,
    disk_used_pct: diskPct,
    uptime_hours: Math.round((os.uptime() / 3600) * 100) / 100,
  }
}

// ── Actions ─────────────────────────────────────────────────────────────────

async function handleAction(body: any): Promise<{ success: boolean; error?: string }> {
  try {
    switch (body.action) {
      case 'restart_worker': {
        if (!body.name || !SAFE_NAME_RE.test(body.name))
          return { success: false, error: 'Missing or invalid "name"' }
        execFileSync('pm2', ['restart', body.name], { timeout: 15_000 })
        return { success: true }
      }
      case 'drain_queue': {
        if (!body.queue || !SAFE_NAME_RE.test(body.queue))
          return { success: false, error: 'Missing or invalid "queue"' }
        const r = getRedis()
        const prefix = `bull:${body.queue}`
        await Promise.all([
          r.del(`${prefix}:wait`),
          r.del(`${prefix}:active`),
          r.del(`${prefix}:delayed`),
          r.del(`${prefix}:failed`),
        ])
        return { success: true }
      }
      case 'scale_worker': {
        if (!body.name || !SAFE_NAME_RE.test(body.name))
          return { success: false, error: 'Missing or invalid "name"' }
        if (typeof body.instances !== 'number' || body.instances < 0 || body.instances > 10)
          return { success: false, error: '"instances" must be a number 0-10' }
        execFileSync('pm2', ['scale', body.name, String(body.instances)], { timeout: 15_000 })
        return { success: true }
      }
      default:
        return { success: false, error: `Unknown action: ${body.action}` }
    }
  } catch (err: any) {
    return { success: false, error: err.message || String(err) }
  }
}

// ── Metrics recording to Supabase ───────────────────────────────────────────

async function recordMetrics(): Promise<void> {
  try {
    const workers = getWorkers()
    const queues = await getQueues()
    const vps = getVps()

    const now = new Date().toISOString()

    const rows: Array<{
      recorded_at: string
      metric_type: string
      metric_name: string
      metric_value: number
    }> = []

    // Queue wait counts
    for (const [name, stats] of Object.entries(queues)) {
      rows.push({
        recorded_at: now,
        metric_type: 'queue_wait',
        metric_name: name,
        metric_value: stats.wait,
      })
    }

    // VPS RAM
    rows.push({
      recorded_at: now,
      metric_type: 'vps_ram_used_mb',
      metric_name: 'ram',
      metric_value: vps.ram_used_mb,
    })

    // VPS CPU load 1min
    rows.push({
      recorded_at: now,
      metric_type: 'vps_cpu_load_1m',
      metric_name: 'cpu',
      metric_value: Math.round(vps.cpu_load[0] * 100) / 100,
    })

    // Worker memory usage
    for (const w of workers) {
      rows.push({
        recorded_at: now,
        metric_type: 'worker_memory_mb',
        metric_name: w.name,
        metric_value: w.memory,
      })
    }

    // Insert metrics
    if (rows.length > 0) {
      const { error: insertErr } = await supabase
        .from('system_metrics')
        .insert(rows)

      if (insertErr) {
        console.error('[monitoring] Failed to insert metrics:', insertErr.message)
      }
    }

    // Prune old data (older than 7 days)
    const cutoff = new Date(Date.now() - METRICS_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { error: deleteErr } = await supabase
      .from('system_metrics')
      .delete()
      .lt('recorded_at', cutoff)

    if (deleteErr) {
      console.error('[monitoring] Failed to prune old metrics:', deleteErr.message)
    }
  } catch (err: any) {
    console.error('[monitoring] recordMetrics error:', err.message)
  }
}

// ── HTTP Server ─────────────────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

const server = http.createServer(async (req, res) => {
  // Auth check
  if (!isAuthorized(req)) {
    sendJson(res, 401, { error: 'Unauthorized' })
    return
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`)

  try {
    // GET /health
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { status: 'ok', uptime: process.uptime() })
      return
    }

    // GET /metrics
    if (req.method === 'GET' && url.pathname === '/metrics') {
      const [workers, queues] = await Promise.all([
        getWorkers(),
        getQueues(),
      ])
      const vps = getVps()
      sendJson(res, 200, {
        workers,
        queues,
        vps,
        timestamp: new Date().toISOString(),
      })
      return
    }

    // POST /trigger-matching  — Called by Vercel when a company is created/updated
    // Publishes Redis event so worker-matching runs the full pipeline immediately
    if (req.method === 'POST' && url.pathname === '/trigger-matching') {
      const raw = await readBody(req)
      let body: any
      try {
        body = JSON.parse(raw)
      } catch {
        sendJson(res, 400, { success: false, error: 'Invalid JSON' })
        return
      }

      const { companyId } = body
      if (!companyId || typeof companyId !== 'string') {
        sendJson(res, 400, { success: false, error: 'companyId is required' })
        return
      }

      try {
        // Sync company to local PG mirror so keyword-matcher can find it
        try {
          const { data: company } = await supabase.supabase
            .from('companies')
            .select('id, cnpj, razao_social, nome_fantasia, cnae_principal, cnaes_secundarios, descricao_servicos, porte, uf, municipio, capacidades, certificacoes, palavras_chave, matching_status')
            .eq('id', companyId)
            .single()

          if (company) {
            const { localPool } = await import('./lib/local-db')
            const cols = ['id', 'cnpj', 'razao_social', 'nome_fantasia', 'cnae_principal', 'cnaes_secundarios', 'descricao_servicos', 'porte', 'uf', 'municipio', 'capacidades', 'certificacoes', 'palavras_chave', 'matching_status']
            const vals = cols.map(k => {
              const v = (company as any)[k]
              if (v === null || v === undefined) return null
              if (typeof v === 'object') return JSON.stringify(v)
              return v
            })
            const ph = cols.map((_, i) => `$${i + 1}`).join(', ')
            const up = cols.filter(k => k !== 'id').map(k => `${k} = EXCLUDED.${k}`).join(', ')
            await localPool.query(
              `INSERT INTO mirror_companies (${cols.join(', ')}) VALUES (${ph}) ON CONFLICT (id) DO UPDATE SET ${up}, synced_at = NOW()`,
              vals,
            )
            console.log(`[monitoring] Synced company ${companyId} to mirror_companies`)
          }
        } catch (syncErr: any) {
          console.warn(`[monitoring] Mirror sync failed (non-blocking): ${syncErr.message}`)
        }

        const r = getRedis()
        await r.publish('licitagram:company-saved', JSON.stringify({ companyId }))
        console.log(`[monitoring] Published company-saved event for ${companyId}`)
        sendJson(res, 200, { success: true, message: `Matching triggered for ${companyId}` })
      } catch (err: any) {
        console.error('[monitoring] Failed to publish Redis event:', err.message)
        sendJson(res, 500, { success: false, error: 'Failed to publish event' })
      }
      return
    }

    // POST /trigger-neural — Called by Vercel to run MiroFish analysis
    // Proxies to MiroFish service on KVM8 and saves results to Supabase
    if (req.method === 'POST' && url.pathname === '/trigger-neural') {
      const raw = await readBody(req)
      let body: any
      try {
        body = JSON.parse(raw)
      } catch {
        sendJson(res, 400, { success: false, error: 'Invalid JSON' })
        return
      }

      const { type, analysisId, tenderId, queryHash, companyId } = body
      if (!type || !analysisId) {
        sendJson(res, 400, { success: false, error: 'type and analysisId required' })
        return
      }

      const MIROFISH_URL = process.env.MIROFISH_URL || 'http://187.77.241.93:5001'
      const MIROFISH_ENABLED = process.env.MIROFISH_ENABLED === 'true'

      if (!MIROFISH_ENABLED) {
        sendJson(res, 200, { success: false, message: 'MiroFish disabled' })
        return
      }

      // Run analysis in background (don't block response)
      sendJson(res, 200, { success: true, message: `Neural analysis queued: ${type}/${analysisId}` })

      try {
        if (type === 'fraud' && tenderId) {
          // Build fraud document from Supabase data
          const { data: tender } = await supabase.supabase
            .from('tenders')
            .select('objeto, orgao_nome, valor_estimado, uf, modalidade_nome')
            .eq('id', tenderId)
            .single()

          const { data: competitors } = await supabase.supabase
            .from('competitors')
            .select('cnpj, nome, valor_proposta, situacao')
            .eq('tender_id', tenderId)

          const { data: alerts } = await supabase.supabase
            .from('fraud_alerts')
            .select('alert_type, severity, detail')
            .eq('tender_id', tenderId)

          // Build document
          let doc = `# Analise de Fraude: Licitacao\n## Dados\n`
          doc += `Objeto: ${tender?.objeto || 'N/A'}\nOrgao: ${tender?.orgao_nome || 'N/A'}\n`
          doc += `Valor: ${tender?.valor_estimado ? 'R$ ' + Number(tender.valor_estimado).toLocaleString('pt-BR') : 'N/I'}\n\n`
          doc += `## Participantes (${competitors?.length || 0})\n`
          for (const c of competitors || []) {
            doc += `- ${c.nome} (${c.cnpj}) - R$ ${c.valor_proposta || 'N/I'} ${c.situacao === 'Vencedor' ? '[VENCEDOR]' : ''}\n`
          }
          doc += `\n## Alertas (${alerts?.length || 0})\n`
          for (const a of alerts || []) {
            doc += `- [${a.severity}] ${a.alert_type}: ${a.detail}\n`
          }

          // Expand partner graph from local PG
          try {
            const cnpjs = (competitors || []).map((c: any) => c.cnpj).filter(Boolean)
            if (cnpjs.length > 0) {
              const { localPool } = await import('./lib/local-db')
              const { rows: partners } = await localPool.query(
                'SELECT cnpj, nome_socio, cnpj_cpf_socio FROM socios WHERE cnpj = ANY($1) LIMIT 200',
                [cnpjs]
              )
              if (partners.length > 0) {
                doc += `\n## Rede Societaria (${partners.length} socios)\n`
                for (const p of partners) {
                  doc += `- ${p.cnpj} → ${p.nome_socio} (${p.cnpj_cpf_socio})\n`
                }
              }
            }
          } catch { /* PG not available, continue without */ }

          // Update status to processing
          await supabase.supabase
            .from('mirofish_fraud_analysis')
            .update({ status: 'processing' })
            .eq('id', analysisId)

          // Call MiroFish
          const mirofishRes = await fetch(`${MIROFISH_URL}/api/licitagram/fraud-analysis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ document: doc, tender_id: tenderId }),
            signal: AbortSignal.timeout(60_000),
          })

          if (mirofishRes.ok) {
            const result = await mirofishRes.json()
            const analysis = result.data?.analysis || {}

            await supabase.supabase
              .from('mirofish_fraud_analysis')
              .update({
                status: 'completed',
                risk_score: analysis.risk_score || 0,
                risk_level: analysis.risk_level || 'low',
                graph_nodes: analysis.graph_nodes || [],
                graph_edges: analysis.graph_edges || [],
                network_depth: analysis.network_depth || 1,
                companies_analyzed: analysis.companies_analyzed || 0,
                hidden_connections: analysis.hidden_connections || [],
                collusion_indicators: analysis.collusion_indicators || [],
                simulation_summary: analysis.simulation_summary || '',
                recommended_actions: analysis.recommended_actions || [],
                llm_tokens_used: analysis.llm_tokens_used || 0,
                analysis_duration_ms: analysis.analysis_duration_ms || 0,
                completed_at: new Date().toISOString(),
              })
              .eq('id', analysisId)

            console.log(`[monitoring] Neural fraud analysis completed: ${analysisId} risk=${analysis.risk_score}`)
          } else {
            const errText = await mirofishRes.text().catch(() => 'unknown')
            await supabase.supabase
              .from('mirofish_fraud_analysis')
              .update({ status: 'failed', error_message: errText.slice(0, 500) })
              .eq('id', analysisId)
          }
        }

        if (type === 'price' && queryHash) {
          await supabase.supabase
            .from('mirofish_price_predictions')
            .update({ status: 'processing' })
            .eq('id', analysisId)

          // For price analysis, build a simpler document
          // The actual price data should come from the API caller
          const mirofishRes = await fetch(`${MIROFISH_URL}/api/licitagram/price-analysis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ document: `Analise de precos para query ${queryHash}`, query_hash: queryHash }),
            signal: AbortSignal.timeout(60_000),
          })

          if (mirofishRes.ok) {
            const result = await mirofishRes.json()
            const pred = result.data?.prediction || {}

            await supabase.supabase
              .from('mirofish_price_predictions')
              .update({
                status: 'completed',
                predicted_range_low: pred.predicted_range_low,
                predicted_range_high: pred.predicted_range_high,
                predicted_median: pred.predicted_median,
                confidence_score: pred.confidence_score || 0,
                supplier_graph_nodes: pred.supplier_graph_nodes || [],
                supplier_graph_edges: pred.supplier_graph_edges || [],
                price_curve: pred.price_curve || [],
                anomaly_flags: pred.anomaly_flags || [],
                supplier_behavior_summary: pred.supplier_behavior_summary || '',
                market_insights: pred.market_insights || '',
                llm_tokens_used: pred.llm_tokens_used || 0,
                analysis_duration_ms: pred.analysis_duration_ms || 0,
                completed_at: new Date().toISOString(),
              })
              .eq('id', analysisId)

            console.log(`[monitoring] Neural price prediction completed: ${analysisId}`)
          } else {
            await supabase.supabase
              .from('mirofish_price_predictions')
              .update({ status: 'failed', error_message: 'MiroFish returned error' })
              .eq('id', analysisId)
          }
        }
      } catch (err: any) {
        console.error(`[monitoring] Neural analysis failed:`, err.message)
        // Update status to failed
        const table = type === 'fraud' ? 'mirofish_fraud_analysis' : 'mirofish_price_predictions'
        await supabase.supabase
          .from(table)
          .update({ status: 'failed', error_message: err.message?.slice(0, 500) })
          .eq('id', analysisId)
          .catch(() => {})
      }
      return
    }

    // POST /action
    if (req.method === 'POST' && url.pathname === '/action') {
      const raw = await readBody(req)
      let body: any
      try {
        body = JSON.parse(raw)
      } catch {
        sendJson(res, 400, { success: false, error: 'Invalid JSON' })
        return
      }
      const result = await handleAction(body)
      sendJson(res, result.success ? 200 : 400, result)
      return
    }

    // POST /extract-pdf — on-demand PDF text extraction for chat
    if (req.method === 'POST' && url.pathname === '/extract-pdf') {
      const raw = await readBody(req)
      let body: any
      try {
        body = JSON.parse(raw)
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON' })
        return
      }

      const { pdfUrl, docId } = body
      if (!pdfUrl || typeof pdfUrl !== 'string') {
        sendJson(res, 400, { error: 'pdfUrl is required' })
        return
      }

      try {
        const pdfParse = require('pdf-parse')
        const AdmZip = require('adm-zip')

        const pdfResponse = await fetch(pdfUrl, {
          signal: AbortSignal.timeout(45_000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'application/pdf, application/zip, application/octet-stream, */*',
          },
          redirect: 'follow',
        })

        if (!pdfResponse.ok) {
          sendJson(res, 502, { error: `PDF fetch failed: HTTP ${pdfResponse.status}` })
          return
        }

        const buffer = Buffer.from(await pdfResponse.arrayBuffer())
        if (buffer.length < 100) {
          sendJson(res, 422, { error: 'File empty' })
          return
        }

        let text = ''

        // Detect ZIP
        const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04
        if (isZip) {
          const zip = new AdmZip(buffer)
          const entries = zip.getEntries()
          const pdfEntries = entries.filter((e: any) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.pdf'))
          const texts: string[] = []
          for (const entry of pdfEntries) {
            try {
              const data = await pdfParse(entry.getData())
              const t = data.text.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
              if (t && t.length >= 50) texts.push(`--- ${entry.entryName} ---\n${t}`)
            } catch { /* skip */ }
          }
          text = texts.join('\n\n')
        } else {
          const data = await pdfParse(buffer)
          text = data.text.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
        }

        if (!text || text.length < 50) {
          sendJson(res, 422, { error: 'No extractable text' })
          return
        }

        // Save to DB if docId provided
        if (docId) {
          const { createClient } = require('@supabase/supabase-js')
          const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
          const sanitized = text.replace(/\0/g, '')
          await supabase.from('tender_documents').update({ texto_extraido: sanitized, status: 'done' }).eq('id', docId)
        }

        sendJson(res, 200, { text, chars: text.length })
      } catch (err: any) {
        sendJson(res, 500, { error: err.message || 'Extraction failed' })
      }
      return
    }

    sendJson(res, 404, { error: 'Not found' })
  } catch (err: any) {
    console.error('[monitoring] Request error:', err.message)
    sendJson(res, 500, { error: 'Internal server error' })
  }
})

// ── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[monitoring] Monitoring server started on port ${PORT}`)
})

// Record metrics every 5 minutes
const metricsInterval = setInterval(recordMetrics, METRICS_RECORD_INTERVAL)

// Record once on startup (after a short delay to let things settle)
setTimeout(recordMetrics, 10_000)

// Graceful shutdown
process.on('SIGINT', () => shutdown())
process.on('SIGTERM', () => shutdown())

function shutdown(): void {
  console.log('[monitoring] Shutting down...')
  clearInterval(metricsInterval)
  server.close()
  redis?.disconnect()
  process.exit(0)
}
