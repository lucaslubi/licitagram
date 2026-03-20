/**
 * PM2 Ecosystem — Multi-Worker Deployment
 *
 * Splits the monolithic worker into specialized processes:
 * 1. worker-scraping    — Data collection (PNCP, ComprasGov, ARP, Legado)
 * 2. worker-matching    — AI triage + semantic matching + keyword matching
 * 3. worker-telegram    — Telegram notifications (high concurrency)
 * 4. worker-whatsapp    — WhatsApp notifications (rate-limited)
 * 5. worker-alerts      — Pending notifications, hot alerts, pipeline health, audit
 * 6. worker-enrichment  — Competitive intelligence (results, fornecedor, classifier)
 *
 * Each process shares the same Redis + Supabase,
 * but BullMQ guarantees no duplicate processing across workers.
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 restart all
 *   pm2 logs worker-matching
 */
module.exports = {
  apps: [
    {
      name: 'worker-scraping',
      script: 'dist/index.js',
      args: '--queues=scraping,extraction',
      cwd: '/opt/licitagram/packages/workers',
      node_args: '--max-old-space-size=384',
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
      // Scraping is I/O bound (network requests) — 1 instance is enough
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
    },
    {
      name: 'worker-matching',
      script: 'dist/index.js',
      args: '--queues=matching',
      cwd: '/opt/licitagram/packages/workers',
      node_args: '--max-old-space-size=512',
      max_memory_restart: '550M',
      env: {
        NODE_ENV: 'production',
      },
      // Matching is CPU-heavy (AI calls) — 1 instance with internal concurrency
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
    },
    {
      name: 'worker-telegram',
      script: 'dist/index.js',
      args: '--queues=telegram',
      cwd: '/opt/licitagram/packages/workers',
      node_args: '--max-old-space-size=256',
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      // Telegram can handle high throughput — 2 instances = 10 concurrent sends
      instances: 2,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: 'worker-whatsapp',
      script: 'dist/index.js',
      args: '--queues=whatsapp',
      cwd: '/opt/licitagram/packages/workers',
      node_args: '--max-old-space-size=256',
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      // WhatsApp is rate-limited (1/1.5s) — 1 instance only
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: 'worker-alerts',
      script: 'dist/index.js',
      args: '--queues=alerts',
      cwd: '/opt/licitagram/packages/workers',
      node_args: '--max-old-space-size=384',
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
      // Alerts are lightweight periodic jobs — 1 instance
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
    },
    {
      name: 'worker-enrichment',
      script: 'dist/index.js',
      args: '--queues=enrichment',
      cwd: '/opt/licitagram/packages/workers',
      node_args: '--max-old-space-size=384',
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
      // Enrichment runs in the background — 1 instance
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
}
