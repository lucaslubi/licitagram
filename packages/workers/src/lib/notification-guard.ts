/**
 * Last-Mile Notification Guard
 *
 * Single source of truth for all notification blocking rules.
 * Called by BOTH Telegram and WhatsApp processors right before sending.
 * This is the final safety net — even if earlier filters miss something,
 * this guard prevents bad notifications from reaching users.
 */
import { supabase } from './supabase'
import { logger } from './logger'

// ─── Non-competitive modalities that cannot be bid on ──────────────────────
// 9 = Inexigibilidade, 12 = Credenciamento, 14 = Inaplicabilidade
const NON_COMPETITIVE_MODALIDADES = new Set([9, 12, 14])

// ─── Minimum score to notify ──────────────────────────────────────────────
const MIN_NOTIFICATION_SCORE = 50

// ─── Only AI-verified sources get notified ─────────────────────────────────
const VERIFIED_SOURCES = new Set(['ai', 'ai_triage', 'semantic', 'keyword'])

export interface GuardResult {
  allowed: boolean
  reason?: string
  match?: Record<string, any>
  tender?: Record<string, any>
  settings?: Record<string, any>
}

/**
 * Validates a match against all notification rules.
 * Returns { allowed: true, match, tender } if the notification should be sent,
 * or { allowed: false, reason } if it should be blocked.
 *
 * This function re-fetches the match from DB to get the latest state —
 * critical for jobs that have been sitting in the queue for hours.
 */
export async function validateNotification(matchId: string): Promise<GuardResult> {
  // 1. Fetch fresh match + tender data from DB
  const { data: match, error } = await supabase
    .from('matches')
    .select(`
      id, score, match_source, breakdown, ai_justificativa, company_id, status, notified_at,
      tenders (
        id, objeto, orgao_nome, uf, municipio, valor_estimado,
        data_abertura, data_encerramento,
        modalidade_nome, modalidade_id,
        numero_compra, ano_compra, pncp_id, status
      ),
      companies (
        id, min_score, min_valor, max_valor, ufs_interesse
      )
    `)
    .eq('id', matchId)
    .single()

  if (error || !match) {
    return { allowed: false, reason: `match_not_found` }
  }

  const tender = (match.tenders as unknown) as Record<string, any>
  const settings = (match.companies as unknown) as Record<string, any>

  if (!tender) {
    return { allowed: false, reason: `tender_not_found` }
  }
  
  if (!settings) {
    return { allowed: false, reason: `company_settings_not_found` }
  }

  // 2. Block non-competitive modalities (inexigibilidade, credenciamento, inaplicabilidade)
  const modalidadeId = tender.modalidade_id as number | null
  if (modalidadeId && NON_COMPETITIVE_MODALIDADES.has(modalidadeId)) {
    logger.info(
      { matchId, modalidadeId, modalidade_nome: tender.modalidade_nome },
      'GUARD BLOCKED: non-competitive modality',
    )
    // Auto-archive this match so it never comes back
    await supabase
      .from('matches')
      .update({ status: 'archived', notified_at: new Date().toISOString() })
      .eq('id', matchId)
    return { allowed: false, reason: `non_competitive_modality_${modalidadeId}` }
  }

  // 3. Block unverified matches (keyword-only)
  if (!VERIFIED_SOURCES.has(match.match_source || '')) {
    return { allowed: false, reason: `unverified_source_${match.match_source}` }
  }

  // 4. Block low-score matches (use company min_score if set, otherwise fallback)
  const companyMinScore = (settings.min_score as number) ?? MIN_NOTIFICATION_SCORE
  if (match.score < companyMinScore) {
    return { allowed: false, reason: `low_score_${match.score}_min_${companyMinScore}` }
  }

  // 5. Block expired tenders
  if (tender.data_encerramento) {
    const encerramento = new Date(tender.data_encerramento as string)
    if (encerramento < new Date()) {
      await supabase
        .from('matches')
        .update({ status: 'expired' })
        .eq('id', matchId)
      return { allowed: false, reason: 'tender_expired' }
    }
  }

  // 6. Block if tender itself was canceled/suspended
  const tenderStatus = tender.status as string | null
  if (tenderStatus && ['canceled', 'suspended', 'revoked'].includes(tenderStatus)) {
    return { allowed: false, reason: `tender_status_${tenderStatus}` }
  }

  // 7. Value Filter (The final gate)
  const valor = tender.valor_estimado as number | null
  if (valor != null) {
    if (settings.min_valor != null && valor < settings.min_valor) {
      return { allowed: false, reason: `value_too_low_${valor}_min_${settings.min_valor}` }
    }
    if (settings.max_valor != null && valor > settings.max_valor) {
      return { allowed: false, reason: `value_too_high_${valor}_max_${settings.max_valor}` }
    }
  }

  // 8. Geography Filter (UF Interest)
  const tenderUf = tender.uf as string | null
  const targetUfs = (settings.ufs_interesse as string[]) || []
  if (targetUfs.length > 0 && tenderUf && !targetUfs.includes(tenderUf)) {
    return { allowed: false, reason: `uf_mismatch_${tenderUf}_allowed_${targetUfs.join(',')}` }
  }

  // 7. notified_at guard REMOVED — BullMQ jobId dedup (tg-${userId}-${matchId} / wa-${userId}-${matchId})
  // already prevents double-sends on the SAME channel. The old guard blocked cross-channel sends
  // (e.g., Telegram finishing first would prevent WhatsApp from sending).

  return {
    allowed: true,
    match: match as unknown as Record<string, unknown>,
    tender,
  }
}

/**
 * Drains and blocks all queued notifications for non-competitive modalities.
 * Run once on startup to clean up any legacy jobs in the queue.
 */
export async function purgeNonCompetitiveMatches(): Promise<number> {
  // Find all matches with non-competitive modalities that are still 'new'
  const { data: badMatches, error } = await supabase
    .from('matches')
    .select('id, tenders!inner(modalidade_id)')
    .eq('status', 'new')
    .is('notified_at', null)
    .in('tenders.modalidade_id', [9, 12, 14])
    .limit(1000)

  if (error || !badMatches || badMatches.length === 0) return 0

  const ids = badMatches.map((m: any) => m.id)

  // Archive them all so they never get queued again
  const { error: updateErr } = await supabase
    .from('matches')
    .update({ status: 'archived', notified_at: new Date().toISOString() })
    .in('id', ids)

  if (!updateErr) {
    logger.info({ count: ids.length }, 'Purged non-competitive matches from notification pipeline')
  }

  return ids.length
}
