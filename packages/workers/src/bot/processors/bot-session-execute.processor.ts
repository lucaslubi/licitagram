/**
 * Bot Session Execute Processor
 *
 * BullMQ worker that runs a bot session from `pending` → terminal state.
 *
 * Lock protocol:
 *   1. Try to acquire a soft lock via UPDATE bot_sessions
 *      SET locked_until = now + 5 min, worker_id = :me
 *      WHERE id = :id AND status IN ('pending','active')
 *        AND (locked_until IS NULL OR locked_until < now)
 *      If rowCount = 0, another worker has it — job completes as no-op.
 *   2. Run the session via BotSessionRunner.
 *   3. If runner returns { reEnqueue: true }, schedule a follow-up job.
 *   4. Release the lock (set locked_until = NULL).
 *
 * Failure isolation: any thrown error is caught, logged to bot_actions,
 * and the lock is released so the watchdog doesn't reap us as a zombie.
 */

import { Worker, UnrecoverableError } from 'bullmq'
import { connection } from '../../queues/connection'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { QUEUE_NAME, type BotSessionExecuteJobData, enqueueBotSession } from '../queues/bot-session-execute.queue'
import { runNexusSession } from '../nexus/runner'

const LOCK_DURATION_MS = 5 * 60 * 1000
const RE_ENQUEUE_DELAY_MS = 500 // tiny delay so we don't busy-loop

function workerTag(): string {
  return `${process.env.HOSTNAME || 'local'}-${process.pid}`
}

async function acquireLock(sessionId: string, tag: string): Promise<boolean> {
  const lockedUntil = new Date(Date.now() + LOCK_DURATION_MS).toISOString()
  const nowIso = new Date().toISOString()

  // Two-step: select + conditional update, because PostgREST can't do the
  // OR-NULL inside a filter for updates. We do a filter for `null OR <now`.
  const { data, error } = await supabase
    .from('bot_sessions')
    .update({ locked_until: lockedUntil, worker_id: tag })
    .eq('id', sessionId)
    .in('status', ['pending', 'active'])
    .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
    .select('id')

  if (error) {
    logger.error({ sessionId, err: error.message }, '[bot-session-execute] lock query failed')
    return false
  }
  return Array.isArray(data) && data.length > 0
}

async function releaseLock(sessionId: string): Promise<void> {
  try {
    await supabase
      .from('bot_sessions')
      .update({ locked_until: null, worker_id: null })
      .eq('id', sessionId)
  } catch {
    /* ignore — sweeper will clean up */
  }
}

export const botSessionExecuteWorker = new Worker<BotSessionExecuteJobData>(
  QUEUE_NAME,
  async (job) => {
    const { sessionId, source } = job.data
    const log = logger.child({ jobId: job.id, sessionId, source })
    const tag = workerTag()

    log.info('Processing bot session')

    const got = await acquireLock(sessionId, tag)
    if (!got) {
      log.info('Lock held by another worker — skipping')
      return { skipped: true, reason: 'lock_held' }
    }

    let result: { reEnqueue: boolean; reason: string } = {
      reEnqueue: false,
      reason: 'unknown',
    }

    try {
      // Tenta primeiro o engine novo (API direto via bot_tokens).
      // Se a empresa tem token conectado, usa ele — muito mais rápido
      // e confiável. Senão cai no runner legado (Playwright).
      const { data: sessRow } = await supabase
        .from('bot_sessions')
        .select('company_id, pregao_id, mode, min_price, strategy_config, portal')
        .eq('id', sessionId)
        .single()

      const isComprasGov = sessRow?.portal === 'comprasgov' || sessRow?.portal === 'comprasnet'

      if (isComprasGov && sessRow) {
        const { data: tokRow } = await supabase
          .from('bot_tokens')
          .select('id')
          .eq('company_id', sessRow.company_id)
          .eq('portal', 'comprasgov')
          .eq('status', 'active')
          .maybeSingle()

        if (!tokRow) {
          // Sem token conectado — falha com mensagem clara pedindo conectar.
          // NÃO cai pro Playwright porque o Playwright não funciona e só
          // geraria erro confuso. Esse é o novo fluxo padrão: sem token = sem robô.
          log.warn({ sessionId }, 'Bot session sem bot_tokens conectado')
          await supabase
            .from('bot_sessions')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              result: {
                error:
                  'Conta Compras.gov.br não conectada. Abra /bot → Conectar Conta Gov.br e use o bookmarklet.',
                code: 'no_gov_connection',
              },
            })
            .eq('id', sessionId)
          result = { reEnqueue: false, reason: 'no_gov_connection' }
          return
        }

        log.info({ sessionId }, 'Using Nexus HTTP engine (bot_tokens connected)')
        const nexusResult = await runNexusSession({
          sessionId,
          companyId: sessRow.company_id,
          pregaoId: sessRow.pregao_id,
          mode: (sessRow.mode || 'supervisor') as 'shadow' | 'supervisor' | 'auto_bid',
          minPrice: sessRow.min_price,
          strategyConfig:
            typeof sessRow.strategy_config === 'object' && sessRow.strategy_config
              ? (sessRow.strategy_config as Record<string, number>)
              : null,
        })
        result = { reEnqueue: false, reason: nexusResult.reason }
        log.info({ result: nexusResult }, 'Nexus session finished')
        return
      }

      // Portal não suportado
      log.warn({ sessionId, portal: sessRow?.portal }, 'Portal não suportado')
      await supabase
        .from('bot_sessions')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          result: {
            error: `Portal "${sessRow?.portal}" ainda não suportado. Use comprasgov.`,
            code: 'portal_not_supported',
          },
        })
        .eq('id', sessionId)
      result = { reEnqueue: false, reason: 'portal_not_supported' }
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        'Unhandled runner error',
      )

      // Still insert an audit row
      try {
        await supabase.from('bot_actions').insert({
          session_id: sessionId,
          action_type: 'error',
          details: {
            reason: err instanceof Error ? err.message : String(err),
            stage: 'processor',
          },
        })
      } catch {
        /* best effort */
      }

      // Mark failed so we don't leave `active` rows around.
      try {
        await supabase
          .from('bot_sessions')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            result: { error: err instanceof Error ? err.message : String(err) },
          })
          .eq('id', sessionId)
          .eq('status', 'active')
      } catch {
        /* best effort */
      }

      // If this is an unrecoverable config/credential issue, don't retry.
      if (err instanceof UnrecoverableError) {
        throw err
      }
    } finally {
      await releaseLock(sessionId)
    }

    if (result.reEnqueue) {
      await enqueueBotSession(sessionId, 'resume', RE_ENQUEUE_DELAY_MS)
      return { reEnqueued: true, reason: result.reason }
    }
    return result
  },
  {
    connection,
    concurrency: 5, // up to 5 sessions per worker process
    lockDuration: 5 * 60 * 1000, // match our DB lock
    // Disable BullMQ's stalled-job detection for this queue — we do our
    // own heartbeat in the DB via the runner.
    stalledInterval: 120_000,
  },
)

botSessionExecuteWorker.on('failed', (job, err) => {
  logger.error(
    {
      jobId: job?.id,
      sessionId: job?.data.sessionId,
      attempts: job?.attemptsMade,
      err: err.message,
    },
    '[bot-session-execute] job failed',
  )
})
