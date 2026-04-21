/**
 * Bot Watchdog Processor
 *
 * Sweeps every 2 min. Two kinds of recovery:
 *
 *   A. LOCK RECOVERY (soft): sessions with `locked_until < now` AND
 *      status in ('pending','active') are considered orphaned by a dead
 *      worker. We don't mark them failed — we just clear the lock and
 *      re-enqueue. Runner lock protocol handles the rest.
 *
 *   B. HEARTBEAT TIMEOUT (hard): sessions stuck in `active` with
 *      last_heartbeat older than 5 min AND error_count < 3 get retried
 *      (re-enqueued). Past 3 retries they are marked failed to avoid
 *      infinite loops.
 *
 * Emits `watchdog_reaped` bot_actions rows for the audit trail and
 * `heartbeat`/`error` bot_events for the forensic timeline.
 */

import { Worker } from 'bullmq'
import { connection } from '../../queues/connection'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { QUEUE_NAME, type BotWatchdogJobData } from '../queues/bot-watchdog.queue'
import { enqueueBotSession } from '../queues/bot-session-execute.queue'

const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000
const MAX_ZOMBIE_RETRIES = 3

export const botWatchdogWorker = new Worker<BotWatchdogJobData>(
  QUEUE_NAME,
  async () => {
    const heartbeatCutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS).toISOString()
    const nowIso = new Date().toISOString()

    // Find zombies: active sessions with stale heartbeat OR stale lock.
    const { data: zombies, error } = await supabase
      .from('bot_sessions')
      .select('id, company_id, portal, last_heartbeat, worker_id, error_count, locked_until')
      .in('status', ['active', 'pending'])
      .or(
        `last_heartbeat.is.null,last_heartbeat.lt.${heartbeatCutoff},locked_until.lt.${nowIso}`,
      )

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
    let reEnqueued = 0
    for (const z of list) {
      const nextErrorCount = (z.error_count ?? 0) + 1

      if (nextErrorCount > MAX_ZOMBIE_RETRIES) {
        // Too many retries — mark failed.
        const { error: upErr } = await supabase
          .from('bot_sessions')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            result: { error: 'watchdog_heartbeat_timeout', retries: nextErrorCount },
            locked_until: null,
            worker_id: null,
            error_count: nextErrorCount,
          })
          .eq('id', z.id)
          .in('status', ['active', 'pending'])

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
            reason: 'heartbeat_timeout_max_retries',
            retries: nextErrorCount,
          },
        })
        reaped++
        continue
      }

      // Retry: clear the lock, increment error_count, move to pending, re-enqueue.
      const { error: upErr } = await supabase
        .from('bot_sessions')
        .update({
          status: 'pending',
          locked_until: null,
          worker_id: null,
          error_count: nextErrorCount,
        })
        .eq('id', z.id)
        .in('status', ['active', 'pending'])

      if (upErr) {
        logger.error(
          { sessionId: z.id, err: upErr.message },
          '[bot-watchdog] failed to reset session to pending',
        )
        continue
      }

      await supabase.from('bot_actions').insert({
        session_id: z.id,
        action_type: 'watchdog_reaped',
        details: {
          last_heartbeat: z.last_heartbeat,
          worker_id: z.worker_id,
          reason: 'requeued',
          retries: nextErrorCount,
        },
      })

      try {
        await enqueueBotSession(z.id, 'watchdog', 2000)
        reEnqueued++
      } catch (err) {
        logger.error(
          { sessionId: z.id, err: err instanceof Error ? err.message : err },
          '[bot-watchdog] re-enqueue failed',
        )
      }
    }

    // ─── Scheduled sessions sweep ────────────────────────────────────────
    // Pega sessões com status='scheduled' cujo scheduled_at já passou e
    // promove pra 'pending' + enfileira. Isso permite cadastrar N pregões
    // em lote pra semana toda e o sistema dispara cada um no horário certo.
    let promoted = 0
    try {
      const { data: due } = await supabase
        .from('bot_sessions')
        .select('id, scheduled_at')
        .eq('status', 'scheduled')
        .lte('scheduled_at', nowIso)
        .limit(100)

      for (const s of due ?? []) {
        const { error: upErr } = await supabase
          .from('bot_sessions')
          .update({ status: 'pending' })
          .eq('id', s.id)
          .eq('status', 'scheduled') // guard race

        if (upErr) {
          logger.warn({ sessionId: s.id, err: upErr.message }, '[bot-watchdog] scheduled→pending failed')
          continue
        }

        try {
          await enqueueBotSession(s.id, 'scheduled', 0)
          promoted++
        } catch (err) {
          logger.error(
            { sessionId: s.id, err: err instanceof Error ? err.message : err },
            '[bot-watchdog] scheduled enqueue failed',
          )
        }
      }
      if (promoted > 0) {
        logger.info({ promoted }, '[bot-watchdog] scheduled sessions promoted')
      }
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : err },
        '[bot-watchdog] scheduled sweep failed',
      )
    }

    logger.info({ reaped, reEnqueued, promoted }, '[bot-watchdog] sweep complete')
    return { reaped, reEnqueued, promoted }
  },
  {
    connection,
    concurrency: 1, // serial — there's no value in parallel sweeps
    lockDuration: 600_000,
    stalledInterval: 600_000,
  },
)

botWatchdogWorker.on('failed', (job, err) => {
  logger.error(
    { jobId: job?.id, err: err.message },
    '[bot-watchdog] job failed',
  )
})
