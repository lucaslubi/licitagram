import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { type NotificationJobData } from '../queues/notification.queue'
import { bot } from '../telegram/bot'
import { formatMatchAlert, formatHotAlert, formatUrgencyAlert48h, formatUrgencyAlert24h, formatNewMatchesDigest } from '../telegram/formatters'
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

      await bot.api.sendMessage(telegramChatId, promptText, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      })

      logger.info({ telegramChatId, matchId }, 'Outcome prompt sent via Telegram')
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

      await bot.api.sendMessage(telegramChatId, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      })

      logger.info({ telegramChatId, matchCount: matches.length }, 'New matches digest sent')
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

    // ── Send Telegram notification ──────────────────────────────────
    const { text, keyboard } = formatMatchAlert({
      matchId: match.id,
      score: match.score,
      breakdown: (match.breakdown as Array<{ category: string; score: number; reason: string }>) || [],
      justificativa: match.ai_justificativa || '',
      tender: {
        objeto: tenderObjeto,
        orgao_nome: (tender?.orgao_nome as string) || '',
        uf: (tender?.uf as string) || '',
        valor_estimado: tender?.valor_estimado as number | null,
        data_abertura: tender?.data_abertura as string | null,
        modalidade_nome: tender?.modalidade_nome as string | null,
      },
    })

    try {
      await bot.api.sendMessage(telegramChatId, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      })
      logger.info({ matchId, telegramChatId }, 'Telegram notification sent')

      // Mark as notified
      const { error: updateErr } = await supabase
        .from('matches')
        .update({ status: 'notified', notified_at: new Date().toISOString() })
        .eq('id', matchId)

      if (updateErr) logger.error({ matchId, error: updateErr }, 'Failed to mark match as notified')
    } catch (err) {
      logger.error({ matchId, telegramChatId, err }, 'Telegram send failed')
      throw err // Let BullMQ retry
    }

    logger.info({ matchId, score: match.score, channels: 1 }, 'Notification processing complete')
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
