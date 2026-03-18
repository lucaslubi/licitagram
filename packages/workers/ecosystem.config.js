/**
 * PM2 Ecosystem Configuration — Licitagram Workers
 *
 * Modes:
 *   pm2 start ecosystem.config.js                    # All-in-one (current setup)
 *   pm2 start ecosystem.config.js --only worker-scraping,worker-matching  # Split pools
 *   pm2 start ecosystem.config.js --only queue-metrics  # Monitoring only
 *
 * Health features:
 *   - max_memory_restart: auto-restart if memory exceeds limit
 *   - exp_backoff_restart_delay: exponential backoff on crashes (100ms → 15s)
 *   - kill_timeout: 15s graceful shutdown before SIGKILL
 *   - listen_timeout: 10s max startup time
 *   - max_restarts: 20 restarts within restart_delay window
 */
module.exports = {
  apps: [
    // ─── All-in-one entrypoint (current default) ──────────────────────────
    {
      name: 'worker-all',
      script: 'dist/index.js',
      cwd: __dirname,
      node_args: '--max-old-space-size=1024 --expose-gc',
      env: {
        NODE_ENV: 'production',
      },
      // Auto-restart on memory pressure (1.2 GB hard limit)
      max_memory_restart: '1200M',
      // Exponential backoff: 100ms, 200ms, 400ms... up to 15s
      exp_backoff_restart_delay: 100,
      // Graceful shutdown: 15s before SIGKILL
      kill_timeout: 15000,
      // Max restarts before PM2 stops trying
      max_restarts: 20,
      // Logs
      error_file: '/var/log/licitagram/worker-all-error.log',
      out_file: '/var/log/licitagram/worker-all-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Auto-start on pm2 startup
      autorestart: true,
    },

    // ─── Scraping pool (I/O-bound: PNCP, comprasgov, BrasilAPI) ──────────
    {
      name: 'worker-scraping',
      script: 'dist/worker-scraping.js',
      cwd: __dirname,
      node_args: '--max-old-space-size=1024 --expose-gc',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '1200M',
      exp_backoff_restart_delay: 100,
      kill_timeout: 15000,
      max_restarts: 20,
      error_file: '/var/log/licitagram/worker-scraping-error.log',
      out_file: '/var/log/licitagram/worker-scraping-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      autorestart: true,
      // Don't auto-start when using "pm2 start ecosystem" — use --only flag
      autostart: false,
    },

    // ─── Matching pool (CPU + AI: triage, semantic, hot alerts) ───────────
    {
      name: 'worker-matching',
      script: 'dist/worker-matching.js',
      cwd: __dirname,
      node_args: '--max-old-space-size=1024 --expose-gc',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '1200M',
      exp_backoff_restart_delay: 100,
      kill_timeout: 15000,
      max_restarts: 20,
      error_file: '/var/log/licitagram/worker-matching-error.log',
      out_file: '/var/log/licitagram/worker-matching-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      autorestart: true,
      autostart: false,
    },

    // ─── Queue metrics exporter (lightweight, always on) ──────────────────
    {
      name: 'queue-metrics',
      script: 'dist/scripts/queue-metrics.js',
      cwd: __dirname,
      node_args: '--max-old-space-size=256',
      env: {
        NODE_ENV: 'production',
        METRICS_INTERVAL_MS: '60000', // Log metrics every 60s
      },
      max_memory_restart: '256M',
      exp_backoff_restart_delay: 100,
      kill_timeout: 5000,
      max_restarts: 50,
      error_file: '/var/log/licitagram/queue-metrics-error.log',
      out_file: '/var/log/licitagram/queue-metrics-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      autorestart: true,
      // Auto-start — lightweight monitoring always runs
      autostart: true,
    },
  ],
}
