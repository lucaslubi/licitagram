import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { type NotificationJobData } from '../queues/notification.queue'
import { bot } from '../telegram/bot'
import { formatMatchAlert, formatHotAlert, formatUrgencyAlert48h, formatUrgencyAlert24h } from '../telegram/formatters'
import { sendMatchAlert as sendWhatsAppAlert, isConnected as isWhatsAppConnected } from '../whatsapp/client'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

// ─── Notification Threshold ──────────────────────────────────────────────
// AI triage already did rigorous filtering — trust its scores.
// Only notify matches with score >= 50 (user's requested threshold).
const MIN_NOTIFICATION_SCORE = 50

const notificationWorker = new Worker<NotificationJobData>(
  'notification',
  async (job) => {
    // ─── Hot Alert ──────────────────────────────────────────────────────
    if ('type' in job.data && job.data.type === 'hot') {
      const { matchId, telegramChatId, rank, plan } = job.data

      if (!bot) {
        logger.warn({ matchId }, 'Hot alert: bot not initialized, skipping')
        return
      }

      const { data: match } = await supabase
        .from('matches')
        .select(`
          id, score, breakdown, ai_justificativa,
          tenders (objeto, orgao_nome, uf, municipio, valor_estimado, modalidade_nome, data_encerramento, numero, ano_compra, pncp_id)
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
        tender: {
          objeto: (tender?.objeto as string) || '',
          orgao_nome: (tender?.orgao_nome as string) || '',
          uf: (tender?.uf as string) || '',
          municipio: (tender?.municipio as string) || '',
          valor_estimado: tender?.valor_estimado as number | null,
          modalidade_nome: tender?.modalidade_nome as string | null,
          data_encerramento: tender?.data_encerramento as string | null,
          numero: tender?.numero as string | null,
          ano: tender?.ano_compra as string | null,
          pncp_id: tender?.pncp_id as string | null,
        },
      })

      await bot.api.sendMessage(telegramChatId, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      })

      logger.info({ matchId, telegramChatId, rank }, 'Hot alert sent')
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

      await bot.api.sendMessage(telegramChatId, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      })

      logger.info({ telegramChatId, type, matchCount: matches.length }, 'Urgency alert sent')
      return
    }

    const { matchId, telegramChatId, whatsappNumber } = job.data

    if (!bot && !whatsappNumber) {
      logger.warn({ matchId }, 'No notification channels available (bot not initialized, no whatsapp), skipping')
      return
    }

    if (telegramChatId && !bot) {
      logger.warn({ matchId, telegramChatId }, 'Telegram requested but bot not initialized')
    }

    const { data: match } = await supabase
      .from('matches')
      .select(`
        id, score, match_source, breakdown, ai_justificativa, company_id,
        tenders (objeto, orgao_nome, uf, valor_estimado, data_abertura, data_encerramento, modalidade_nome)
      `)
      .eq('id', matchId)
      .single()

    if (!match) {
      logger.warn({ matchId }, 'Match not found for notification')
      return
    }

    // ── BLOCK unverified matches — only AI-verified sources get notified ──
    const VERIFIED_SOURCES = ['ai', 'ai_triage', 'semantic']
    if (!VERIFIED_SOURCES.includes(match.match_source || '')) {
      logger.info(
        { matchId, matchSource: match.match_source, score: match.score },
        'Notification blocked: match not AI-verified (keyword-only)',
      )
      return
    }

    // ── Skip expired tenders — don't notify about already-closed tenders ──
    const tenderData = (match.tenders as unknown) as Record<string, unknown>
    if (tenderData?.data_encerramento) {
      const encerramento = new Date(tenderData.data_encerramento as string)
      if (encerramento < new Date()) {
        logger.info(
          { matchId, data_encerramento: tenderData.data_encerramento },
          'Skipping notification for expired tender',
        )
        await supabase
          .from('matches')
          .update({ status: 'expired' })
          .eq('id', matchId)
        return
      }
    }

    // ── Score threshold — AI triage already did rigorous filtering ──────
    const tender = tenderData
    const tenderObjeto = (tender?.objeto as string) || ''

    if (match.score < MIN_NOTIFICATION_SCORE) {
      logger.info({ matchId, score: match.score }, 'Notification skipped: below minimum score threshold')
      return
    }

    // ── Send notifications (Telegram + WhatsApp in parallel) ──────────
    const tenderInfo = {
      objeto: tenderObjeto,
      orgao_nome: (tender?.orgao_nome as string) || '',
      uf: (tender?.uf as string) || '',
      valor_estimado: tender?.valor_estimado as number | null,
      data_abertura: tender?.data_abertura as string | null,
      modalidade_nome: tender?.modalidade_nome as string | null,
    }

    const sendPromises: Promise<void>[] = []

    // Telegram
    if (telegramChatId && bot) {
      const { text, keyboard } = formatMatchAlert({
        matchId: match.id,
        score: match.score,
        breakdown: (match.breakdown as Array<{ category: string; score: number; reason: string }>) || [],
        justificativa: match.ai_justificativa || '',
        tender: tenderInfo,
      })
      sendPromises.push(
        bot.api.sendMessage(telegramChatId, text, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        }).then(() => {
          logger.info({ matchId, telegramChatId }, 'Telegram notification sent')
        }),
      )
    }

    // WhatsApp
    if (whatsappNumber) {
      sendPromises.push(
        (async () => {
          const waConnected = await isWhatsAppConnected()
          if (!waConnected) {
            logger.warn({ matchId }, 'WhatsApp not connected, skipping')
            return
          }
          await sendWhatsAppAlert(
            whatsappNumber,
            {
              score: match.score,
              justificativa: match.ai_justificativa || '',
              recomendacao: undefined,
            },
            tenderInfo,
            matchId,
          )
        })(),
      )
    }

    const results = await Promise.allSettled(sendPromises)
    const anySuccess = results.some((r) => r.status === 'fulfilled')

    if (anySuccess) {
      const { error: updateErr } = await supabase
        .from('matches')
        .update({ status: 'notified', notified_at: new Date().toISOString() })
        .eq('id', matchId)

      if (updateErr) logger.error({ matchId, error: updateErr }, 'Failed to mark match as notified')
    }

    for (const r of results) {
      if (r.status === 'rejected') {
        logger.warn({ matchId, error: (r.reason as Error).message }, 'Notification channel failed')
      }
    }

    logger.info({ matchId, score: match.score, channels: sendPromises.length }, 'Notification processing complete')
  },
  {
    connection,
    concurrency: 5,
    limiter: { max: 20, duration: 60_000 },
  },
)

notificationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Notification job failed')
})

export { notificationWorker }
