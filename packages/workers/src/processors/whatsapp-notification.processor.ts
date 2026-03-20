/**
 * WhatsApp Notification Processor
 *
 * Dedicated worker for sending WhatsApp messages via Evolution API.
 * Runs independently from Telegram — no blocking between channels.
 * Rate limited to 1 msg/s (Evolution API constraint).
 */
import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import type { WhatsAppNotificationJobData } from '../queues/notification-whatsapp.queue'
import { sendMatchAlert, sendOutcomePrompt, isConnected } from '../whatsapp/client'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

const whatsappNotificationWorker = new Worker<WhatsAppNotificationJobData>(
  'notification-whatsapp',
  async (job) => {
    const { matchId, whatsappNumber } = job.data

    // Check Evolution API connectivity
    const connected = await isConnected()
    if (!connected) {
      logger.warn({ matchId }, 'WhatsApp Evolution API not connected, skipping')
      return
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
        logger.error({ matchId, err }, 'WhatsApp outcome prompt failed')
        throw err
      }
      return
    }

    const { data: match } = await supabase
      .from('matches')
      .select(`
        id, score, match_source, ai_justificativa, company_id,
        tenders (objeto, orgao_nome, uf, valor_estimado, data_abertura, modalidade_nome, modalidade_id)
      `)
      .eq('id', matchId)
      .single()

    if (!match) {
      logger.warn({ matchId }, 'WhatsApp: match not found')
      return
    }

    // Block non-competitive modalities (inexigibilidade, credenciamento, inaplicabilidade)
    const tenderCheck = (match.tenders as unknown) as Record<string, unknown>
    const modalidadeId = tenderCheck?.modalidade_id as number | null
    if (modalidadeId && [9, 12, 14].includes(modalidadeId)) {
      logger.info(
        { matchId, modalidadeId },
        'WhatsApp notification blocked: non-competitive modality',
      )
      return
    }

    const tender = tenderCheck

    try {
      await sendMatchAlert(
        whatsappNumber,
        {
          score: match.score,
          justificativa: match.ai_justificativa || '',
          recomendacao: undefined,
        },
        {
          objeto: (tender?.objeto as string) || '',
          orgao_nome: (tender?.orgao_nome as string) || '',
          uf: (tender?.uf as string) || '',
          valor_estimado: tender?.valor_estimado as number | null,
          data_abertura: tender?.data_abertura as string | null,
          modalidade_nome: tender?.modalidade_nome as string | null,
        },
        matchId,
      )
      // Mark match as notified (prevents re-sending on next pending check)
      await supabase
        .from('matches')
        .update({
          notified_at: new Date().toISOString(),
          status: 'notified',
        })
        .eq('id', matchId)
        .is('notified_at', null) // Only if not already notified by Telegram

      logger.info({ matchId, whatsappNumber: whatsappNumber.slice(-4) }, 'WhatsApp notification sent')
    } catch (err) {
      logger.error({ matchId, err }, 'WhatsApp notification failed')
      throw err // Let BullMQ retry
    }
  },
  {
    connection,
    concurrency: 1, // 1 at a time — Evolution API rate limit
    limiter: { max: 1, duration: 1500 }, // ~1 msg per 1.5s
  },
)

whatsappNotificationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'WhatsApp notification job failed')
})

export { whatsappNotificationWorker }
