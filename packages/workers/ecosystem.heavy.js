/**
 * PM2 Ecosystem Configuration — Heavy Workers
 * To be run on the KVM 8 VPS (8 cores, 32GB RAM)
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
  ]
}
