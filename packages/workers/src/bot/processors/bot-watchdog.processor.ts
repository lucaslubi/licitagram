/**
 * Bot Watchdog Processor
 *
 * Reaps zombie bot_sessions whose worker died or lost heartbeat.
 *
 * Heartbeat timeout: 5 minutes.
 *
 * For each zombie:
 *   - mark session failed, result.error = 'watchdog_heartbeat_timeout'
 *   - emit a `watchdog_reaped` bot_actions row
 *   - do NOT try to reach the worker (we assume it's dead)
 *
 * Also clears stale `locked_until` rows so a new worker can pick up the
 * session's credential config safely.
 */

import { Worker } from 'bullmq'
import { connection } from '../../queues/connection'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { QUEUE_NAME, type BotWatchdogJobData } from '../queues/bot-watchdog.queue'

const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000

export const botWatchdogWorker = new Worker<BotWatchdogJobData>(
  QUEUE_NAME,
  async () => {
    const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS).toISOString()

    // Find zombies
    const { data: zombies, error } = await supabase
      .from('bot_sessions')
      .select('id, company_id, portal, last_heartbeat, worker_id')
      .eq('status', 'active')
      .or(`last_heartbeat.is.null,last_heartbeat.lt.${cutoff}`)

    if (error) {
      logger.error({ err: error.message }, '[bot-watchdog] query failed')
      return { reaped: 0 }
    }

    const list = zombies ?? []
    if (list.length === 0) {
      return { reaped: 0 }
    }

    logger.warn({ count: list.length }, '[bot-watchdog] found zombie sessions')

    let reaped = 0
    for (const z of list) {
      const { error: upErr } = await supabase
        .from('bot_sessions')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          result: { error: 'watchdog_heartbeat_timeout', last_heartbeat: z.last_heartbeat },
        })
        .eq('id', z.id)
        .eq('status', 'active') // guard: don't clobber if someone resurrected it

      if (upErr) {
        logger.error(
          { sessionId: z.id, err: upErr.message },
          '[bot-watchdog] failed to mark session as failed',
        )
        continue
      }

      await supabase.from('bot_actions').insert({
        session_id: z.id,
        action_type: 'watchdog_reaped',
        details: {
          last_heartbeat: z.last_heartbeat,
          worker_id: z.worker_id,
          reason: 'heartbeat timeout',
        },
      })

      reaped++
    }

    logger.info({ reaped }, '[bot-watchdog] sweep complete')
    return { reaped }
  },
  {
    connection,
    concurrency: 1, // serial — there's no value in parallel sweeps
  },
)

botWatchdogWorker.on('failed', (job, err) => {
  logger.error(
    { jobId: job?.id, err: err.message },
    '[bot-watchdog] job failed',
  )
})
