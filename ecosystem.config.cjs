/**
 * PM2 Ecosystem Config — Licitagram Workers
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 restart ecosystem.config.cjs
 *   pm2 delete all && pm2 start ecosystem.config.cjs
 *
 * Worker groups are split by queue to enable true parallelism
 * and prevent CPU spikes from overlapping jobs.
 */
const NODE_ARGS = '--max-old-space-size=512'
const CWD = '/opt/licitagram'
const SCRIPT = 'packages/workers/dist/index.js'

// Shared restart strategy: exponential backoff on crashes (100ms → 200ms → 400ms → ...)
const RESTART_OPTS = {
  exp_backoff_restart_delay: 1000, // Start at 1s, double on each crash (max ~15min)
  kill_timeout: 10000,             // Give 10s for graceful shutdown
  listen_timeout: 30000,           // 30s to mark as ready
}

module.exports = {
  apps: [
    // ─── Scraping (PNCP, comprasgov, ARP, legado, results) ───
    {
      name: 'worker-scraping',
      script: SCRIPT,
      cwd: CWD,
      node_args: NODE_ARGS,
      args: '--queues scraping',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '400M',
      ...RESTART_OPTS,
      env: { NODE_ENV: 'production' },
    },

    // ─── Extraction (PDF download, text extraction, CNAE classification) ───
    {
      name: 'worker-extraction',
      script: SCRIPT,
      cwd: CWD,
      node_args: NODE_ARGS,
      args: '--queues extraction',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '400M',
      ...RESTART_OPTS,
      env: { NODE_ENV: 'production' },
    },

    // ─── Matching (keyword + semantic + AI triage) ───
    {
      name: 'worker-matching',
      script: SCRIPT,
      cwd: CWD,
      node_args: NODE_ARGS,
      args: '--queues matching',
      instances: 1,
      exec_mode: 'cluster',
      max_memory_restart: '400M',
      ...RESTART_OPTS,
      env: { NODE_ENV: 'production' },
    },

    // ─── Enrichment (results, competition, fornecedor, contact, AI classifier) ───
    {
      name: 'worker-enrichment',
      script: SCRIPT,
      cwd: CWD,
      node_args: NODE_ARGS,
      args: '--queues enrichment',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '400M',
      ...RESTART_OPTS,
      env: { NODE_ENV: 'production' },
    },

    // ─── Alerts (pending-notifications, hot-alerts, map-cache, health, audit, healing) ───
    {
      name: 'worker-alerts',
      script: SCRIPT,
      cwd: CWD,
      node_args: NODE_ARGS,
      args: '--queues alerts',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '400M',
      ...RESTART_OPTS,
      env: { NODE_ENV: 'production' },
    },

    // ─── Telegram notifications (bot polling — MUST be single instance) ───
    {
      name: 'worker-telegram',
      script: SCRIPT,
      cwd: CWD,
      node_args: NODE_ARGS,
      args: '--queues telegram',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '300M',
      kill_timeout: 15000,              // Extra time for bot.stop() graceful shutdown
      exp_backoff_restart_delay: 5000,  // Longer backoff to avoid 409 conflicts
      listen_timeout: 30000,
      env: { NODE_ENV: 'production' },
    },

    // ─── WhatsApp notifications ───
    {
      name: 'worker-whatsapp',
      script: SCRIPT,
      cwd: CWD,
      node_args: NODE_ARGS,
      args: '--queues whatsapp',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '300M',
      ...RESTART_OPTS,
      env: { NODE_ENV: 'production' },
    },

    // ─── Email notifications ───
    {
      name: 'worker-email',
      script: SCRIPT,
      cwd: CWD,
      node_args: NODE_ARGS,
      args: '--queues email',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '300M',
      ...RESTART_OPTS,
      env: { NODE_ENV: 'production' },
    },

    // ─── Certidões (Puppeteer-based, resource-heavy) ───
    {
      name: 'worker-certidoes',
      script: SCRIPT,
      cwd: CWD,
      node_args: NODE_ARGS,
      args: '--queues certidoes',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '400M',
      ...RESTART_OPTS,
      env: { NODE_ENV: 'production' },
    },

    // ─── Monitoring server (health endpoint) ───
    {
      name: 'monitoring-server',
      script: 'packages/workers/dist/monitoring-server.js',
      cwd: CWD,
      node_args: '--max-old-space-size=256',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '200M',
      ...RESTART_OPTS,
      env: { NODE_ENV: 'production' },
    },
  ],
}
