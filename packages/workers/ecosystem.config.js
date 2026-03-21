/**
 * PM2 Ecosystem Configuration — Licitagram Workers (Parallel Mode)
 *
 * 8 independent worker processes running in parallel:
 *   - worker-scraping:    PNCP, comprasgov, ARP, legado scrapers
 *   - worker-extraction:  PDF extraction, document processing
 *   - worker-matching:    keyword, AI triage, semantic matching
 *   - worker-alerts:      hot scan, urgency checks, pending-notifications, digests
 *   - worker-telegram:    Telegram message delivery (rate limited by Telegram API)
 *   - worker-whatsapp:    WhatsApp message delivery via Evolution API (1 msg/s)
 *   - worker-enrichment:  results scraping, competitor stats, contact/CNAE enrichment
 *   - worker-certidoes:   Puppeteer-based certidao automation
 *
 * Usage:
 *   pm2 start ecosystem.config.js          # Start all 6 workers + metrics
 *   pm2 logs worker-telegram               # View Telegram logs
 *   pm2 logs worker-whatsapp               # View WhatsApp logs
 *   pm2 monit                              # Monitor all processes
 */
const path = require('path')
const ROOT = path.resolve(__dirname, '../..')
const WORKERS = __dirname
const SCRIPT = path.join(WORKERS, 'dist/index.js')

const baseConfig = {
  cwd: ROOT,
  env: { NODE_ENV: 'production' },
  max_memory_restart: '200M',
  exp_backoff_restart_delay: 1000,
  kill_timeout: 15000,
  max_restarts: 20,
  merge_logs: true,
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  autorestart: true,
}

module.exports = {
  apps: [
    // ─── Scraping: PNCP, comprasgov, ARP, legado, results ─────────────
    {
      ...baseConfig,
      name: 'worker-scraping',
      script: SCRIPT,
      args: '--queues scraping',
      node_args: '--max-old-space-size=512 --expose-gc',
      out_file: '/var/log/licitagram/worker-scraping-out.log',
      error_file: '/var/log/licitagram/worker-scraping-err.log',
    },

    // ─── Extraction: PDF parsing, document processing ──────────────────
    {
      ...baseConfig,
      name: 'worker-extraction',
      script: SCRIPT,
      args: '--queues extraction',
      node_args: '--max-old-space-size=256 --expose-gc',
      max_memory_restart: '300M',
      out_file: '/var/log/licitagram/worker-extraction-out.log',
      error_file: '/var/log/licitagram/worker-extraction-err.log',
    },

    // ─── Matching: keyword, AI triage, semantic ────────────────────────
    {
      ...baseConfig,
      name: 'worker-matching',
      script: SCRIPT,
      args: '--queues matching',
      node_args: '--max-old-space-size=512 --expose-gc',
      out_file: '/var/log/licitagram/worker-matching-out.log',
      error_file: '/var/log/licitagram/worker-matching-err.log',
    },

    // ─── Alerts: hot scan, urgency, pending-notifications, digests ────
    // Discovers opportunities and enqueues to telegram + whatsapp queues
    {
      ...baseConfig,
      name: 'worker-alerts',
      script: SCRIPT,
      args: '--queues alerts',
      node_args: '--max-old-space-size=256',
      out_file: '/var/log/licitagram/worker-alerts-out.log',
      error_file: '/var/log/licitagram/worker-alerts-err.log',
    },

    // ─── Telegram: message delivery (30 msg/s rate limit) ────────────
    {
      ...baseConfig,
      name: 'worker-telegram',
      script: SCRIPT,
      args: '--queues telegram',
      node_args: '--max-old-space-size=256',
      out_file: '/var/log/licitagram/worker-telegram-out.log',
      error_file: '/var/log/licitagram/worker-telegram-err.log',
    },

    // ─── WhatsApp: message delivery via Evolution API (1 msg/s) ──────
    {
      ...baseConfig,
      name: 'worker-whatsapp',
      script: SCRIPT,
      args: '--queues whatsapp',
      node_args: '--max-old-space-size=256',
      out_file: '/var/log/licitagram/worker-whatsapp-out.log',
      error_file: '/var/log/licitagram/worker-whatsapp-err.log',
    },

    // ─── Enrichment: results scraping, competitor stats, contact/CNAE enrichment
    // Runs competition analysis pipeline independently
    {
      ...baseConfig,
      name: 'worker-enrichment',
      script: SCRIPT,
      args: '--queues enrichment',
      node_args: '--max-old-space-size=512 --expose-gc',
      out_file: '/var/log/licitagram/worker-enrichment-out.log',
      error_file: '/var/log/licitagram/worker-enrichment-err.log',
    },

    // ─── Certidoes: Puppeteer-based certidao automation ──────────────
    {
      ...baseConfig,
      name: 'worker-certidoes',
      script: SCRIPT,
      args: '--queues certidoes',
      node_args: '--max-old-space-size=512 --expose-gc',
      max_memory_restart: '600M',
      out_file: '/var/log/licitagram/worker-certidoes-out.log',
      error_file: '/var/log/licitagram/worker-certidoes-err.log',
    },

    // ─── Queue metrics (lightweight monitoring) ────────────────────────
    {
      ...baseConfig,
      name: 'queue-metrics',
      script: path.join(WORKERS, 'dist/scripts/queue-metrics.js'),
      node_args: '--max-old-space-size=256',
      env: { NODE_ENV: 'production', METRICS_INTERVAL_MS: '60000' },
      max_memory_restart: '256M',
      out_file: '/var/log/licitagram/queue-metrics-out.log',
      error_file: '/var/log/licitagram/queue-metrics-err.log',
    },
  ],
}
