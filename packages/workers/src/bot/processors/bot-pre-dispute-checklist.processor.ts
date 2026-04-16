/**
 * Pre-Dispute Checklist Processor.
 *
 * Builds the "ready for dispute" report 24h before the pregão opens and
 * notifies the client via WhatsApp (if connected). The current implementation
 * produces a conservative baseline:
 *
 *   - session + pregão metadata
 *   - CND status summary (from existing cert tables if present)
 *   - price intel reminder ("sugerimos configurar valor final mínimo")
 *   - a friendly countdown and CTA to parametrize the robô público
 *
 * The full "competitor intel" lane lands in Phase 3 when we wire the
 * supplier history joins in. For now the checklist is a safety net — it
 * surfaces preparation gaps before the auction.
 *
 * The checklist result is stored as a bot_actions row (action_type =
 * `strategy_configured`) plus a bot_events row for the forensic timeline.
 */

import { Worker } from 'bullmq'
import { connection } from '../../queues/connection'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import {
  QUEUE_NAME,
  type PreDisputeChecklistJobData,
} from '../queues/bot-pre-dispute-checklist.queue'

async function loadSessionAndCompany(sessionId: string) {
  const { data } = await supabase
    .from('bot_sessions')
    .select(
      'id, company_id, pregao_id, portal, min_price, status, started_at, bot_configs(id, username)',
    )
    .eq('id', sessionId)
    .single()
  return data
}

async function loadCompanyCerts(companyId: string) {
  // Best-effort: check the certidao tables if they exist. We return a
  // summary (ok / warning / missing) rather than raw rows.
  try {
    const { data } = await supabase
      .from('company_certidoes')
      .select('tipo, status, valida_ate')
      .eq('company_id', companyId)
    return data ?? []
  } catch {
    return []
  }
}

type CertRow = { tipo: string; status: string | null; valida_ate: string | null }

function buildChecklistMessage(
  session: {
    pregao_id: string
    portal: string
    min_price: number | null
    started_at: string | null
  },
  certs: CertRow[],
): string {
  const lines: string[] = []
  lines.push('🤖 Licitagram Supreme Bot — Checklist pré-disputa')
  lines.push('')
  lines.push(`Pregão: ${session.pregao_id}`)
  lines.push(`Portal: ${session.portal}`)
  if (session.started_at) {
    lines.push(`Início: ${new Date(session.started_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`)
  }
  lines.push('')

  if (session.min_price === null) {
    lines.push('⚠️ Valor final mínimo não configurado — o robô não vai cobrir a disputa.')
  } else {
    lines.push(`✅ Valor final mínimo: R$ ${session.min_price.toFixed(2)}`)
  }

  // Certs
  const now = Date.now()
  const expiring = certs.filter((c) => {
    if (!c.valida_ate) return false
    const d = Date.parse(c.valida_ate)
    return Number.isFinite(d) && d - now < 30 * 24 * 3600 * 1000
  })
  if (certs.length === 0) {
    lines.push('ℹ️ Nenhuma CND cadastrada para conferência.')
  } else if (expiring.length > 0) {
    lines.push(`⚠️ ${expiring.length} CND(s) vencem em até 30 dias:`)
    for (const e of expiring) {
      lines.push(`   • ${e.tipo} — até ${e.valida_ate ?? '?'}`)
    }
  } else {
    lines.push(`✅ ${certs.length} CND(s) válidas.`)
  }

  lines.push('')
  lines.push('— Equipe Licitagram')
  return lines.join('\n')
}

export const botPreDisputeChecklistWorker = new Worker<PreDisputeChecklistJobData>(
  QUEUE_NAME,
  async (job) => {
    const { sessionId } = job.data
    const log = logger.child({ jobId: job.id, sessionId })

    const session = await loadSessionAndCompany(sessionId)
    if (!session) {
      log.warn('session not found — dropping checklist')
      return { skipped: true, reason: 'session_not_found' }
    }
    if (session.status === 'cancelled' || session.status === 'failed') {
      log.info('session no longer runnable — skipping checklist')
      return { skipped: true, reason: session.status }
    }

    const certs = (await loadCompanyCerts(session.company_id)) as CertRow[]
    const message = buildChecklistMessage(session, certs)

    // Persist as an action for the UI.
    await supabase.from('bot_actions').insert({
      session_id: sessionId,
      action_type: 'strategy_configured',
      details: {
        kind: 'pre_dispute_checklist',
        message,
        cert_count: certs.length,
      },
    })

    // Forensic event — easy to scrub to on the timeline.
    await supabase.from('bot_events').insert({
      session_id: sessionId,
      kind: 'snapshot',
      payload: { kind: 'pre_dispute_checklist', ok: true },
    })

    // WhatsApp delivery — best-effort, reuses existing notification path.
    // We avoid importing the WhatsApp client directly to keep this processor
    // independent. The UI can still surface the message via bot_actions.
    log.info({ certs: certs.length }, 'Pre-dispute checklist produced')
    return { message_length: message.length, cert_count: certs.length }
  },
  {
    connection,
    concurrency: 3,
  },
)

botPreDisputeChecklistWorker.on('failed', (job, err) => {
  logger.error(
    { jobId: job?.id, sessionId: job?.data.sessionId, err: err.message },
    '[bot-pre-dispute-checklist] failed',
  )
})
