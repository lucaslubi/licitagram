/**
 * PM2 Ecosystem Configuration — Licitagram Workers
 * Optimized for KVM 8 VPS (8 cores, 32GB RAM, 15K clients)
 *
 * Worker distribution (23 processes total):
 *   - worker-scraping    x6  (300M each) — PNCP, comprasgov, ARP, legado scrapers
 *   - worker-extraction  x3  (400M each) — PDF extraction, document processing
 *   - worker-matching    x4  (300M each) — keyword, AI triage, semantic matching
 *   - worker-enrichment  x2  (300M each) — Geocoding + data enrichment
 *   - worker-alerts      x1  (256M)      — Auto-healing + system alerts
 *   - worker-telegram    x1  (200M)      — Telegram message delivery
 *   - worker-whatsapp    x1  (200M)      — WhatsApp message delivery
 *   - worker-certidoes   x1  (512M)      — Certidão automation (Puppeteer)
 *   - licitagram-bot     x1  (512M)      — Bidding bot (Playwright)
 *   - licitagram-login   x1  (300M)      — Guided login server (Playwright)
 *   - monitoring-server  x1  (128M)      — Metrics HTTP server
 *   - queue-metrics      x1  (128M)      — Queue metrics collector
 *
 * Usage:
 *   pm2 start ecosystem.config.js          # Start all workers + metrics
 *   pm2 logs worker-scraping               # View scraping logs
 *   pm2 monit                              # Monitor all processes
 */
const path = require('path')
const ROOT = path.resolve(__dirname, '../..')
const WORKERS = __dirname
const SCRIPT = path.join(WORKERS, 'dist/index.js')

const baseConfig = {
  cwd: ROOT,
  env: { NODE_ENV: 'production' },
  exp_backoff_restart_delay: 1000,
  kill_timeout: 5000,
  max_restarts: 15,
  min_uptime: '10s',
  merge_logs: true,
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  autorestart: true,
}

module.exports = {
  apps: [
    // ─── Scraping: PNCP, comprasgov, ARP, legado, results ─────────────
    // Main bottleneck — 6 instances in cluster mode
    {
      ...baseConfig,
      name: 'worker-scraping',
      script: SCRIPT,
      args: '--queues scraping',
      instances: 6,
      exec_mode: 'cluster',
      node_args: '--max-old-space-size=300 --expose-gc',
      max_memory_restart: '300M',
      out_file: '/var/log/licitagram/worker-scraping-out.log',
      error_file: '/var/log/licitagram/worker-scraping-err.log',
    },

    // ─── Extraction: PDF parsing, document processing ──────────────────
    // 3 instances for parallel PDF processing
    {
      ...baseConfig,
      name: 'worker-extraction',
      script: SCRIPT,
      args: '--queues extraction',
      instances: 3,
      exec_mode: 'cluster',
      node_args: '--max-old-space-size=400 --expose-gc',
      max_memory_restart: '400M',
      out_file: '/var/log/licitagram/worker-extraction-out.log',
      error_file: '/var/log/licitagram/worker-extraction-err.log',
    },

    // ─── Matching: keyword, AI triage, semantic ────────────────────────
    // 4 instances to handle 15K client matching load
    {
      ...baseConfig,
      name: 'worker-matching',
      script: SCRIPT,
      args: '--queues matching',
      instances: 4,
      exec_mode: 'cluster',
      node_args: '--max-old-space-size=300 --expose-gc',
      max_memory_restart: '300M',
      out_file: '/var/log/licitagram/worker-matching-out.log',
      error_file: '/var/log/licitagram/worker-matching-err.log',
    },

    // ─── Enrichment: geocoding, results scraping, competitor stats ─────
    // 2 instances for parallel enrichment
    {
      ...baseConfig,
      name: 'worker-enrichment',
      script: SCRIPT,
      args: '--queues enrichment',
      instances: 2,
      exec_mode: 'cluster',
      node_args: '--max-old-space-size=300 --expose-gc',
      max_memory_restart: '300M',
      out_file: '/var/log/licitagram/worker-enrichment-out.log',
      error_file: '/var/log/licitagram/worker-enrichment-err.log',
    },

    // ─── Alerts: hot scan, urgency, pending-notifications, digests ────
    // Single instance — auto-healing + system alerts
    {
      ...baseConfig,
      name: 'worker-alerts',
      script: SCRIPT,
      args: '--queues alerts',
      node_args: '--max-old-space-size=256',
      max_memory_restart: '256M',
      out_file: '/var/log/licitagram/worker-alerts-out.log',
      error_file: '/var/log/licitagram/worker-alerts-err.log',
    },

    // ─── Telegram: message delivery (30 msg/s rate limit) ────────────
    {
      ...baseConfig,
      name: 'worker-telegram',
      script: SCRIPT,
      args: '--queues telegram',
      node_args: '--max-old-space-size=200',
      max_memory_restart: '200M',
      out_file: '/var/log/licitagram/worker-telegram-out.log',
      error_file: '/var/log/licitagram/worker-telegram-err.log',
    },

    // ─── WhatsApp: message delivery via Evolution API (1 msg/s) ──────
    {
      ...baseConfig,
      name: 'worker-whatsapp',
      script: SCRIPT,
      args: '--queues whatsapp',
      node_args: '--max-old-space-size=200',
      max_memory_restart: '200M',
      out_file: '/var/log/licitagram/worker-whatsapp-out.log',
      error_file: '/var/log/licitagram/worker-whatsapp-err.log',
    },

    // ─── Email: message delivery via Resend API (10 emails/s) ────────
    {
      ...baseConfig,
      name: 'worker-email',
      script: SCRIPT,
      args: '--queues email',
      node_args: '--max-old-space-size=200',
      max_memory_restart: '200M',
      out_file: '/var/log/licitagram/worker-email-out.log',
      error_file: '/var/log/licitagram/worker-email-err.log',
    },

    // ─── Certidoes: Puppeteer-based certidao automation ──────────────
    {
      ...baseConfig,
      name: 'worker-certidoes',
      script: SCRIPT,
      args: '--queues certidoes',
      node_args: '--max-old-space-size=512 --expose-gc',
      max_memory_restart: '512M',
      out_file: '/var/log/licitagram/worker-certidoes-out.log',
      error_file: '/var/log/licitagram/worker-certidoes-err.log',
    },

    // ─── Bidding Bot: Playwright-based automated bidding ──────────────
    // TODO: uncomment when licitagram-bot script is ready
    // {
    //   ...baseConfig,
    //   name: 'licitagram-bot',
    //   script: path.join(WORKERS, 'dist/licitagram-bot.js'),
    //   node_args: '--max-old-space-size=512 --expose-gc',
    //   max_memory_restart: '512M',
    //   out_file: '/var/log/licitagram/licitagram-bot-out.log',
    //   error_file: '/var/log/licitagram/licitagram-bot-err.log',
    // },

    // ─── Guided Login Server: Playwright-based login helper ──────────
    // TODO: uncomment when licitagram-login script is ready
    // {
    //   ...baseConfig,
    //   name: 'licitagram-login',
    //   script: path.join(WORKERS, 'dist/licitagram-login.js'),
    //   node_args: '--max-old-space-size=300',
    //   max_memory_restart: '300M',
    //   out_file: '/var/log/licitagram/licitagram-login-out.log',
    //   error_file: '/var/log/licitagram/licitagram-login-err.log',
    // },

    // ─── Monitoring HTTP server (port 3998) ──────────────────────────
    {
      ...baseConfig,
      name: 'monitoring-server',
      script: path.join(WORKERS, 'dist/monitoring-server.js'),
      node_args: '--max-old-space-size=128',
      max_memory_restart: '128M',
      env: {
        NODE_ENV: 'production',
        MONITORING_PORT: '3998',
      },
      out_file: '/var/log/licitagram/monitoring-server-out.log',
      error_file: '/var/log/licitagram/monitoring-server-err.log',
    },
    
    // ─── Data API Server (Enrichment/Leads) (port 3997) ──────────────
    {
      ...baseConfig,
      name: 'enrichment-api',
      script: path.join(WORKERS, 'dist/enrichment-api/data-api-server.js'),
      node_args: '--max-old-space-size=256',
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        DATA_API_PORT: '3997',
      },
      out_file: '/var/log/licitagram/enrichment-api-out.log',
      error_file: '/var/log/licitagram/enrichment-api-err.log',
    },

    // ─── Queue metrics collector ─────────────────────────────────────
    {
      ...baseConfig,
      name: 'queue-metrics',
      script: path.join(WORKERS, 'dist/scripts/queue-metrics.js'),
      node_args: '--max-old-space-size=128',
      max_memory_restart: '128M',
      env: { NODE_ENV: 'production', METRICS_INTERVAL_MS: '60000' },
      out_file: '/var/log/licitagram/queue-metrics-out.log',
      error_file: '/var/log/licitagram/queue-metrics-err.log',
    },
  ],
}
