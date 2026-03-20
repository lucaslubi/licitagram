/**
 * PM2 Ecosystem — Multi-Worker Deployment
 *
 * Splits the monolithic worker into specialized processes:
 * 1. worker-scraping    — Data collection (PNCP, ComprasGov, ARP, Legado)
 * 2. worker-matching    — AI triage + semantic matching + keyword matching
 * 3. worker-telegram-1  — Telegram notifications instance 1
 * 4. worker-telegram-2  — Telegram notifications instance 2
 * 5. worker-whatsapp    — WhatsApp notifications (rate-limited)
 * 6. worker-alerts      — Pending notifications, hot alerts, pipeline health, audit
 * 7. worker-enrichment  — Competitive intelligence (results, fornecedor, classifier)
 *
 * Each process shares the same Redis + Supabase,
 * but BullMQ guarantees no duplicate processing across workers.
 *
 * IMPORTANT: exec_mode MUST be 'fork' — our workers are not HTTP servers,
 * they use BullMQ + Redis pub/sub which doesn't support Node.js cluster mode.
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
      script: 'packages/workers/dist/index.js',
      args: '--queues=scraping,extraction',
      cwd: '/opt/licitagram',
      node_args: '--max-old-space-size=384',
      exec_mode: 'fork',
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
    },
    {
      name: 'worker-matching',
      script: 'packages/workers/dist/index.js',
      args: '--queues=matching',
      cwd: '/opt/licitagram',
      node_args: '--max-old-space-size=512',
      exec_mode: 'fork',
      max_memory_restart: '550M',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
    },
    {
      name: 'worker-telegram-1',
      script: 'packages/workers/dist/index.js',
      args: '--queues=telegram',
      cwd: '/opt/licitagram',
      node_args: '--max-old-space-size=256',
      exec_mode: 'fork',
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: 'worker-telegram-2',
      script: 'packages/workers/dist/index.js',
      args: '--queues=telegram',
      cwd: '/opt/licitagram',
      node_args: '--max-old-space-size=256',
      exec_mode: 'fork',
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: 'worker-whatsapp',
      script: 'packages/workers/dist/index.js',
      args: '--queues=whatsapp',
      cwd: '/opt/licitagram',
      node_args: '--max-old-space-size=256',
      exec_mode: 'fork',
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: 'worker-alerts',
      script: 'packages/workers/dist/index.js',
      args: '--queues=alerts',
      cwd: '/opt/licitagram',
      node_args: '--max-old-space-size=384',
      exec_mode: 'fork',
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
    },
    {
      name: 'worker-enrichment',
      script: 'packages/workers/dist/index.js',
      args: '--queues=enrichment',
      cwd: '/opt/licitagram',
      node_args: '--max-old-space-size=384',
      exec_mode: 'fork',
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
}
