// Ensure .env gets loaded properly in PM2 regardless of CWD.
import { resolve } from 'path'
import { config } from 'dotenv'
config({ path: resolve(__dirname, '../../.env') })
config({ path: resolve(__dirname, '../.env') })
import { logger } from './lib/logger'
import { supabase } from './lib/supabase'
import { BotSessionRunner } from './bot/bot-session-runner'

const activeRunners = new Map<string, BotSessionRunner>()
const MAX_CONCURRENT_SESSIONS = 3

async function pollPendingSessions() {
  if (activeRunners.size >= MAX_CONCURRENT_SESSIONS) return

  const { data: pendingSessions, error } = await supabase
    .from('bot_sessions')
    .select('id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(MAX_CONCURRENT_SESSIONS - activeRunners.size)

  if (error) {
    logger.error({ err: error.message }, 'Error polling bot sessions')
    return
  }

  if (pendingSessions && pendingSessions.length > 0) {
    for (const session of pendingSessions) {
      if (activeRunners.has(session.id)) continue

      logger.info({ sessionId: session.id }, 'Found pending session, starting runner')
      const runner = new BotSessionRunner(session.id)
      activeRunners.set(session.id, runner)

      runner.start().catch((err) => {
        logger.error({ sessionId: session.id, err: err.message }, 'Runner failed')
      }).finally(() => {
        activeRunners.delete(session.id)
        logger.info({ sessionId: session.id }, 'Runner stopped')
      })
    }
  }
}

async function main() {
  logger.info('Starting licitagram-bot poller...')
  
  setInterval(() => {
    pollPendingSessions().catch(err => {
      logger.error({ err: err.message }, 'Poll interval error')
    })
  }, 10000)

  // graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down runners...')
    for (const [id, runner] of activeRunners.entries()) {
      await runner.stop()
    }
    process.exit(0)
  })
}

main().catch(err => {
  logger.error({ err: err.message }, 'Fatal bot error')
  process.exit(1)
})
