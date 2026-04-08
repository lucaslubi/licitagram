/**
 * PM2 Ecosystem Configuration — Light Workers (APIs, Webhooks, Notifications)
 * To be run on the smaller front-facing VPS that suffered CPU spikes
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
    // ─── Alerts: hot scan, urgency, pending-notifications, digests ────
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
  ]
}
