/**
 * PM2 Configuration — LICITAGRAM BOT
 * Python-based bidding automation worker
 */
const path = require('path')
const ROOT = path.resolve(__dirname, '../..')

module.exports = {
  apps: [
    {
      name: 'licitagram-bot',
      script: 'python3',
      args: path.join(__dirname, 'src/worker.py'),
      cwd: ROOT,
      env: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
      exp_backoff_restart_delay: 100,
      kill_timeout: 15000,
      max_restarts: 20,
      autorestart: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: '/var/log/licitagram/licitagram-bot-out.log',
      error_file: '/var/log/licitagram/licitagram-bot-err.log',
    },
  ],
}
