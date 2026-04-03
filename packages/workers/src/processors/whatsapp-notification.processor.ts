/**
 * WhatsApp Notification Processor
 *
 * Dedicated worker for sending WhatsApp messages via Evolution API.
 * Runs independently from Telegram — no blocking between channels.
 * Rate limited to ~10 msg/s (with BullMQ limiter).
 * Retries with exponential backoff on failure.
 */
import { Worker, UnrecoverableError } from 'bullmq'
import { connection } from '../queues/connection'
import type { WhatsAppNotificationJobData } from '../queues/notification-whatsapp.queue'
import { sendMatchAlert, sendOutcomePrompt, isConnected } from '../whatsapp/client'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'
import { validateNotification } from '../lib/notification-guard'
import { createNotification } from '../lib/create-notification'

/**
 * Handle WhatsApp/Evolution API errors with proper retry semantics.
 * - Connection issues: throw to retry with backoff
 * - 429 rate limit: throw to retry with backoff (BullMQ exponential handles it)
 * - 400/404 (bad number, invalid): unrecoverable, don't retry
 */
function handleWhatsAppError(err: unknown, context: Record<string, unknown>): never {
  const error = err as Error & { message?: string }
  const message = error.message || ''

  // Parse HTTP status from Evolution API error messages like "Evolution API 400: ..."
  const statusMatch = message.match(/Evolution API (\d+):/)
  const statusCode = statusMatch ? parseInt(statusMatch[1]) : 0

  // Bad request or not found — invalid number, don't retry
  if (statusCode === 400 || statusCode === 404) {
    logger.warn({ ...context, statusCode, message }, 'WhatsApp unrecoverable error, will not retry')
    throw new UnrecoverableError(`WhatsApp ${statusCode}: ${message}`)
  }

  // Rate limited — let BullMQ exponential backoff handle it
  if (statusCode === 429) {
    logger.warn({ ...context, statusCode }, 'WhatsApp rate limited, will retry with backoff')
  }

  // All other errors — throw to let BullMQ retry with exponential backoff
  logger.error({ ...context, statusCode, err }, 'WhatsApp send failed, will retry')
  throw err
}

const whatsappNotificationWorker = new Worker<WhatsAppNotificationJobData>(
  'notification-whatsapp',
  async (job) => {
    const { matchId, whatsappNumber } = job.data

    // Check Evolution API connectivity
    const connected = await isConnected()
    if (!connected) {
      logger.warn({ matchId, attempt: job.attemptsMade + 1 }, 'WhatsApp Evolution API not connected, will retry')
      throw new Error('WhatsApp Evolution API not connected')
    }

    // ─── Outcome Prompt ──────────────────────────────────────────────
    if ('type' in job.data && job.data.type === 'outcome_prompt') {
      const { tenderObjeto, tenderOrgao, daysSinceClose } = job.data

      try {
        await sendOutcomePrompt(
          whatsappNumber,
          { objeto: tenderObjeto, orgao_nome: tenderOrgao },
          matchId,
          daysSinceClose,
        )
      } catch (err) {
        handleWhatsAppError(err, { matchId, type: 'outcome_prompt', attempt: job.attemptsMade + 1 })
      }
      return
    }

    // ── LAST-MILE GUARD — single source of truth for all blocking rules ──
    const guard = await validateNotification(matchId)
    if (!guard.allowed) {
      logger.info({ matchId, reason: guard.reason }, 'WhatsApp GUARD BLOCKED')
      return
    }

    const tender = guard.tender!
    const match = guard.match!

    try {
      await sendMatchAlert(
        whatsappNumber,
        {
          score: match.score as number,
          justificativa: (match.ai_justificativa as string) || '',
          recomendacao: undefined,
        },
        {
          objeto: (tender.objeto as string) || '',
          orgao_nome: (tender.orgao_nome as string) || '',
          uf: (tender.uf as string) || '',
          valor_estimado: tender.valor_estimado as number | null,
          data_abertura: tender.data_abertura as string | null,
          modalidade_nome: tender.modalidade_nome as string | null,
        },
        matchId,
      )
      // Mark match as notified — both channels can set this independently; last-write-wins is fine
      await supabase
        .from('matches')
        .update({
          notified_at: new Date().toISOString(),
          status: 'notified',
        })
        .eq('id', matchId)

      logger.info({ matchId, whatsappNumber: whatsappNumber.slice(-4) }, 'WhatsApp notification sent')
    } catch (err) {
      handleWhatsAppError(err, { matchId, whatsappNumber: whatsappNumber.slice(-4), type: 'match_alert', attempt: job.attemptsMade + 1 })
    }
  },
  {
    connection,
    concurrency: 2,
    limiter: { max: 10, duration: 1000 }, // 10 msgs/sec — safe for Evolution API
  },
)

whatsappNotificationWorker.on('failed', (job, err) => {
  const attempt = job?.attemptsMade ?? 0
  const maxAttempts = job?.opts?.attempts ?? 5
  logger.error(
    { jobId: job?.id, attempt, maxAttempts, err },
    attempt >= maxAttempts ? 'WhatsApp notification job permanently failed' : 'WhatsApp notification job failed, will retry',
  )
})

export { whatsappNotificationWorker }
