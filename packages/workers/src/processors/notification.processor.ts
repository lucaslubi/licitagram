import { Worker, UnrecoverableError } from 'bullmq'
import type { Job } from 'bullmq'
import { connection } from '../queues/connection'
import { type NotificationJobData } from '../queues/notification.queue'
import { bot } from '../telegram/bot'
import { formatMatchAlert, formatHotAlert, formatUrgencyAlert48h, formatUrgencyAlert24h, formatNewMatchesDigest, formatWeeklyDigest } from '../telegram/formatters'
import { sendWhatsAppText } from '../whatsapp/client'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'
import { validateNotification } from '../lib/notification-guard'
import { createNotification } from '../lib/create-notification'

/**
 * Handle Telegram API errors with proper retry semantics.
 * - 429 (rate limited): throw with metadata so BullMQ retries with backoff
 * - 403/400 (bot blocked, chat not found): unrecoverable, don't retry
 * - Other errors: throw to let BullMQ retry with exponential backoff
 */
function handleTelegramError(err: unknown, context: Record<string, unknown>): never {
  const error = err as { error_code?: number; parameters?: { retry_after?: number }; description?: string; message?: string }
  const statusCode = error.error_code || 0
  const description = error.description || error.message || 'Unknown error'

  // Rate limited — let BullMQ exponential backoff handle the retry
  if (statusCode === 429) {
    const retryAfter = error.parameters?.retry_after || 30
    logger.warn({ ...context, retryAfter }, `Telegram rate limited, will retry with backoff`)
    throw err
  }

  // Bot was blocked by user, chat not found, or bad request — don't retry
  if (statusCode === 403 || statusCode === 400) {
    logger.warn({ ...context, statusCode, description }, 'Telegram unrecoverable error, will not retry')
    throw new UnrecoverableError(`Telegram ${statusCode}: ${description}`)
  }

  // All other errors — throw to let BullMQ retry with exponential backoff
  logger.error({ ...context, statusCode, err }, 'Telegram send failed, will retry')
  throw err
}

const notificationWorker = new Worker<NotificationJobData>(
  'notification',
  async (job) => {
    // ─── Hot Alert ──────────────────────────────────────────────────────
    if ('type' in job.data && job.data.type === 'hot') {
      const { matchId, telegramChatId, rank, plan, competitionScore, topCompetitors } = job.data

      if (!bot) {
        logger.warn({ matchId }, 'Hot alert: bot not initialized, skipping')
        return
      }

      const { data: match } = await supabase
        .from('matches')
        .select(`
          id, score, breakdown, ai_justificativa,
          tenders (objeto, orgao_nome, uf, municipio, valor_estimado, modalidade_nome, data_encerramento, numero_compra, ano_compra, pncp_id)
        `)
        .eq('id', matchId)
        .single()

      if (!match) {
        logger.warn({ matchId }, 'Hot alert: match not found')
        return
      }

      const tender = (match.tenders as unknown) as Record<string, unknown>
      const { text, keyboard } = formatHotAlert({
        matchId: match.id,
        rank,
        score: match.score,
        breakdown: (match.breakdown as Array<{ category: string; score: number; reason: string }>) || [],
        justificativa: match.ai_justificativa || '',
        plan,
        competitionScore: competitionScore ?? 50,
        topCompetitors: topCompetitors ?? [],
        tender: {
          objeto: (tender?.objeto as string) || '',
          orgao_nome: (tender?.orgao_nome as string) || '',
          uf: (tender?.uf as string) || '',
          municipio: (tender?.municipio as string) || '',
          valor_estimado: tender?.valor_estimado as number | null,
          modalidade_nome: tender?.modalidade_nome as string | null,
          data_encerramento: tender?.data_encerramento as string | null,
          numero: tender?.numero_compra as string | null,
          ano: tender?.ano_compra as string | null,
          pncp_id: tender?.pncp_id as string | null,
        },
      })

      try {
        await bot.api.sendMessage(telegramChatId, text, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        })
        logger.info({ matchId, telegramChatId, rank }, 'Hot alert sent')
      } catch (err) {
        handleTelegramError(err, { matchId, telegramChatId, type: 'hot', attempt: job.attemptsMade + 1 })
      }
      return
    }

    // ─── Urgency Alerts (48h / 24h) ─────────────────────────────────────
    if ('type' in job.data && (job.data.type === 'urgency_48h' || job.data.type === 'urgency_24h')) {
      const { telegramChatId, matches, totalValor, type } = job.data

      if (!bot) {
        logger.warn({ type }, 'Urgency alert: bot not initialized, skipping')
        return
      }

      const { text, keyboard } = type === 'urgency_48h'
        ? formatUrgencyAlert48h(matches, totalValor)
        : formatUrgencyAlert24h(matches, totalValor)

      try {
        await bot.api.sendMessage(telegramChatId, text, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        })
        logger.info({ telegramChatId, type, matchCount: matches.length }, 'Urgency alert sent')
      } catch (err) {
        handleTelegramError(err, { telegramChatId, type, attempt: job.attemptsMade + 1 })
      }
      return
    }

    // ─── Outcome Prompt ────────────────────────────────────────────────
    if ('type' in job.data && job.data.type === 'outcome_prompt') {
      const { matchId, telegramChatId, tenderObjeto, tenderOrgao, daysSinceClose } = job.data

      if (!bot) {
        logger.warn({ matchId }, 'Outcome prompt: bot not initialized, skipping')
        return
      }

      const objeto = (tenderObjeto || 'Sem descrição').substring(0, 100).replace(/[<>&]/g, '')
      const orgao = (tenderOrgao || '').replace(/[<>&]/g, '')
      const promptText = [
        '📊 <b>Resultado da Licitação</b>',
        '',
        `A licitação encerrou há ${daysSinceClose} dia(s):`,
        `📋 ${objeto}`,
        `🏛️ ${orgao}`,
        '',
        'Como foi o resultado?',
      ].join('\n')

      const { InlineKeyboard } = await import('grammy')
      const keyboard = new InlineKeyboard()
        .text('🎉 Ganhamos!', `outcome_won_${matchId}`)
        .text('😔 Perdemos', `outcome_lost_${matchId}`)
        .row()
        .text('❌ Não participamos', `outcome_skip_${matchId}`)

      try {
        await bot.api.sendMessage(telegramChatId, promptText, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        })
        logger.info({ telegramChatId, matchId }, 'Outcome prompt sent via Telegram')
      } catch (err) {
        handleTelegramError(err, { matchId, telegramChatId, type: 'outcome_prompt', attempt: job.attemptsMade + 1 })
      }
      return
    }

    // ─── New Matches Digest ────────────────────────────────────────────
    if ('type' in job.data && job.data.type === 'new_matches') {
      const { telegramChatId, matches, totalValor } = job.data

      if (!bot) {
        logger.warn('New matches digest: bot not initialized, skipping')
        return
      }

      const { text, keyboard } = formatNewMatchesDigest(matches, totalValor)

      try {
        await bot.api.sendMessage(telegramChatId, text, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        })
        logger.info({ telegramChatId, matchCount: matches.length }, 'New matches digest sent')
      } catch (err) {
        handleTelegramError(err, { telegramChatId, type: 'new_matches', attempt: job.attemptsMade + 1 })
      }
      return
    }

    // ─── Weekly Digest ─────────────────────────────────────────────────
    if ('type' in job.data && job.data.type === 'weekly_digest') {
      const { telegramChatId, whatsappNumber, actions, companyName } = job.data

      const { text, keyboard } = formatWeeklyDigest(actions, companyName)

      // Send via Telegram
      if (telegramChatId && bot) {
        try {
          await bot.api.sendMessage(telegramChatId, text, {
            parse_mode: 'HTML',
            reply_markup: keyboard,
          })
          logger.info({ telegramChatId, actionCount: actions.length }, 'Weekly digest sent via Telegram')
        } catch (err) {
          logger.error({ telegramChatId, err }, 'Failed to send weekly digest via Telegram')
        }
      }

      // Send via WhatsApp
      if (whatsappNumber) {
        try {
          // Strip HTML tags for WhatsApp plain text
          const plainText = text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          await sendWhatsAppText(whatsappNumber, plainText)
          logger.info({ whatsappNumber, actionCount: actions.length }, 'Weekly digest sent via WhatsApp')
        } catch (err) {
          logger.error({ whatsappNumber, err }, 'Failed to send weekly digest via WhatsApp')
        }
      }

      return
    }

    const { matchId, telegramChatId } = job.data

    if (!bot) {
      logger.warn({ matchId }, 'Telegram bot not initialized, skipping')
      return
    }

    if (!telegramChatId) {
      logger.debug({ matchId }, 'No telegramChatId, skipping')
      return
    }

    // ── LAST-MILE GUARD — single source of truth for all blocking rules ──
    const guard = await validateNotification(matchId)
    if (!guard.allowed) {
      logger.info({ matchId, reason: guard.reason }, 'Telegram GUARD BLOCKED')
      return
    }

    const match = guard.match!
    const tender = guard.tender!

    // ── Send Telegram notification ──────────────────────────────────
    const { text, keyboard } = formatMatchAlert({
      matchId: match.id as string,
      score: match.score as number,
      breakdown: (match.breakdown as Array<{ category: string; score: number; reason: string }>) || [],
      justificativa: (match.ai_justificativa as string) || '',
      tender: {
        objeto: (tender.objeto as string) || '',
        orgao_nome: (tender.orgao_nome as string) || '',
        uf: (tender.uf as string) || '',
        valor_estimado: tender.valor_estimado as number | null,
        data_abertura: tender.data_abertura as string | null,
        modalidade_nome: tender.modalidade_nome as string | null,
      },
    })

    try {
      await bot.api.sendMessage(telegramChatId, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      })
      logger.info({ matchId, telegramChatId }, 'Telegram notification sent')

      // Mark as notified — both channels can set this independently; last-write-wins is fine
      const { error: updateErr } = await supabase
        .from('matches')
        .update({ status: 'notified', notified_at: new Date().toISOString() })
        .eq('id', matchId)

      if (updateErr) logger.error({ matchId, error: updateErr }, 'Failed to mark match as notified')

      // Insert into unified notifications table
      if (match && tender) {
        const companyId = (match as any).company_id
        if (companyId) {
          // Resolve userId from telegramChatId since it's not in the job data
          const { data: notifUser } = await supabase
            .from('users')
            .select('id')
            .eq('telegram_chat_id', telegramChatId)
            .single()

          if (notifUser) {
            await createNotification({
              userId: notifUser.id,
              companyId,
              type: (match.score as number) >= 85 ? 'hot_match' : 'new_match',
              title: `Nova oportunidade (Score ${match.score})`,
              body: ((tender.objeto as string) || '').substring(0, 200),
              link: `/opportunities/${matchId}`,
              metadata: { score: match.score, orgao: tender.orgao_nome },
            })
          }
        }
      }
    } catch (err) {
      handleTelegramError(err, { matchId, telegramChatId, type: 'match_alert', attempt: job.attemptsMade + 1 })
    }

    logger.info({ matchId, score: match.score, channels: 1 }, 'Notification processing complete')
  },
  {
    connection,
    concurrency: 5,
    limiter: { max: 30, duration: 1000 }, // Telegram limit: 30 msgs/sec
    lockDuration: 600_000,
    stalledInterval: 600_000,
  },
)

notificationWorker.on('failed', (job, err) => {
  const attempt = job?.attemptsMade ?? 0
  const maxAttempts = job?.opts?.attempts ?? 5
  logger.error(
    { jobId: job?.id, attempt, maxAttempts, err },
    attempt >= maxAttempts ? 'Notification job permanently failed' : 'Notification job failed, will retry',
  )
})

export { notificationWorker }
