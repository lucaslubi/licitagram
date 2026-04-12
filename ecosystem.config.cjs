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
      env: { NODE_ENV: 'production' },
    },

    // ─── Extraction (PDF download, text extraction, CNAE classification) ───
    {
      name: 'worker-extraction',
      script: SCRIPT,
      cwd: CWD,
      node_args: NODE_ARGS,
      args: '--queues extraction',
      instances: 2, // Reduced from 3 — concurrency:3 × 2 = 6 parallel
      exec_mode: 'cluster',
      max_memory_restart: '400M',
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
      env: { NODE_ENV: 'production' },
    },

    // ─── Telegram notifications ───
    {
      name: 'worker-telegram',
      script: SCRIPT,
      cwd: CWD,
      node_args: NODE_ARGS,
      args: '--queues telegram',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '300M',
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
      env: { NODE_ENV: 'production' },
    },
  ],
}
