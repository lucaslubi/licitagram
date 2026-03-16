import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { type NotificationJobData } from '../queues/notification.queue'
import { bot } from '../telegram/bot'
import { formatMatchAlert } from '../telegram/formatters'
import { sendMatchAlert as sendWhatsAppAlert, isConnected as isWhatsAppConnected } from '../whatsapp/client'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { CNAE_DIVISIONS } from '@licitagram/shared'
import { tokenize } from './keyword-matcher'

// ─── Local Quality Gate (replaces AI quality gate — zero cost) ───────────

const HIGH_CONFIDENCE_THRESHOLD = 75   // Score >= 75 → send directly (high bar to avoid spam)
const BORDERLINE_MIN = 50              // Score 50-74 → keyword phrase check

/**
 * Local Quality Gate: For borderline matches (score 45-65), verify using
 * PHRASE-LEVEL keyword overlap that the company's CNAE is relevant.
 * Uses complete keyword phrases (not individual tokens) to prevent false positives.
 * Zero API cost — uses CNAE keyword matching instead of Gemini.
 */
function localQualityGate(
  matchId: string,
  score: number,
  companyCnaes: string[],
  tenderObjeto: string,
): boolean {
  // High confidence → send directly
  if (score >= HIGH_CONFIDENCE_THRESHOLD) return true

  // Below borderline minimum → don't send
  if (score < BORDERLINE_MIN) return false

  // Borderline (45-65) → check CNAE keyword PHRASE overlap with tender objeto
  const objetoTokens = new Set(tokenize(tenderObjeto))

  for (const cnae of companyCnaes) {
    const div = cnae.substring(0, 2)
    const division = CNAE_DIVISIONS[div]
    if (division) {
      let kwPhraseMatches = 0
      for (const kw of division.keywords) {
        const kwTokens = tokenize(kw)
        // PHRASE-LEVEL: ALL tokens of the keyword must be present in tender
        if (kwTokens.length > 0 && kwTokens.every((t: string) => objetoTokens.has(t))) {
          kwPhraseMatches++
          if (kwPhraseMatches >= 3) return true // 3+ phrase matches → send
        }
      }
    }
  }

  logger.info(
    { matchId, score },
    'Match dismissed by local quality gate (borderline score, insufficient CNAE keyword phrase overlap)',
  )
  return false
}

const notificationWorker = new Worker<NotificationJobData>(
  'notification',
  async (job) => {
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

    // ── Local Quality Gate for borderline matches ────────────────────
    const tender = tenderData
    const tenderObjeto = (tender?.objeto as string) || ''

    // Fetch company CNAEs for the quality gate
    const { data: company } = await supabase
      .from('companies')
      .select('cnae_principal, cnaes_secundarios')
      .eq('id', match.company_id)
      .single()

    if (company) {
      const companyCnaes: string[] = []
      if (company.cnae_principal) companyCnaes.push(String(company.cnae_principal).substring(0, 2))
      if (Array.isArray(company.cnaes_secundarios)) {
        for (const c of company.cnaes_secundarios as string[]) {
          companyCnaes.push(String(c).substring(0, 2))
        }
      }

      const shouldSend = localQualityGate(matchId, match.score, companyCnaes, tenderObjeto)
      if (!shouldSend) {
        await supabase
          .from('matches')
          .update({ status: 'dismissed' })
          .eq('id', matchId)
        logger.info({ matchId, score: match.score }, 'Notification blocked by local quality gate')
        return
      }
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
