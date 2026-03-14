import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { type NotificationJobData } from '../queues/notification.queue'
import { bot } from '../telegram/bot'
import { formatMatchAlert } from '../telegram/formatters'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { callGemini } from '../ai/gemini-client'

// ─── AI Quality Gate Constants ────────────────────────────────────────────

const HIGH_CONFIDENCE_THRESHOLD = 66   // Score >= 66 → send directly
const BORDERLINE_MIN = 40              // Score 40-65 → AI quick-check
const AI_GATE_TIMEOUT = 10_000         // 10s timeout for AI check

/**
 * AI Quality Gate: For borderline matches (score 40-65), verify with AI
 * that the company's CNAE actually allows participation in the tender.
 * Returns true if the match should be sent, false if it should be dismissed.
 */
async function aiQualityGate(
  matchId: string,
  score: number,
  companyCnaes: string[],
  tenderObjeto: string,
): Promise<boolean> {
  // High confidence → send directly
  if (score >= HIGH_CONFIDENCE_THRESHOLD) return true

  // Below borderline minimum → don't send
  if (score < BORDERLINE_MIN) return false

  // Borderline (40-65) → AI quick-check
  try {
    const cnaeList = companyCnaes.join(', ')
    const prompt = `Uma empresa com CNAEs nas divisoes [${cnaeList}] pode participar de uma licitacao sobre: "${tenderObjeto.slice(0, 300)}"?\nResponda APENAS "SIM" ou "NAO".`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), AI_GATE_TIMEOUT)

    try {
      const response = await callGemini({
        model: 'gemini-2.0-flash-lite',
        system: 'Voce e um especialista em licitacoes brasileiras. Responda apenas SIM ou NAO.',
        prompt,
        maxRetries: 1,
      })

      clearTimeout(timeout)

      const answer = response.trim().toUpperCase()
      const approved = answer.startsWith('SIM')

      if (!approved) {
        // Mark match as dismissed by AI gate
        await supabase
          .from('matches')
          .update({ status: 'dismissed' })
          .eq('id', matchId)

        logger.info(
          { matchId, score, answer },
          'Match dismissed by AI quality gate (borderline score)',
        )
      }

      return approved
    } catch {
      clearTimeout(timeout)
      // If AI check fails, send the notification anyway (fail-open)
      logger.warn({ matchId, score }, 'AI quality gate failed, sending notification anyway')
      return true
    }
  } catch (err) {
    logger.warn({ matchId, err }, 'AI quality gate error, sending notification anyway')
    return true
  }
}

const notificationWorker = new Worker<NotificationJobData>(
  'notification',
  async (job) => {
    if (!bot) {
      logger.warn('Telegram bot not available, skipping notification')
      return
    }

    const { matchId, telegramChatId } = job.data

    const { data: match } = await supabase
      .from('matches')
      .select(`
        id, score, breakdown, ai_justificativa, company_id,
        tenders (objeto, orgao_nome, uf, valor_estimado, data_abertura, modalidade_nome)
      `)
      .eq('id', matchId)
      .single()

    if (!match) {
      logger.warn({ matchId }, 'Match not found for notification')
      return
    }

    // ── AI Quality Gate for borderline matches ────────────────────────
    const tender = (match.tenders as unknown) as Record<string, unknown>
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

      const shouldSend = await aiQualityGate(matchId, match.score, companyCnaes, tenderObjeto)
      if (!shouldSend) {
        logger.info({ matchId, score: match.score }, 'Notification blocked by AI quality gate')
        return
      }
    }

    // ── Send notification ─────────────────────────────────────────────
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

    await bot.api.sendMessage(telegramChatId, text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    })

    const { error: updateErr } = await supabase
      .from('matches')
      .update({ status: 'notified', notified_at: new Date().toISOString() })
      .eq('id', matchId)

    if (updateErr) logger.error({ matchId, error: updateErr }, 'Failed to mark match as notified')

    logger.info({ matchId, telegramChatId, score: match.score }, 'Notification sent')
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
