/**
 * Phrase-Based Keyword Matcher (v3 — High Precision)
 *
 * CRITICAL FIX over v2: Keywords are matched as COMPLETE PHRASES,
 * not individual tokens. This prevents false positives where generic
 * single tokens like "sistema", "rede", "seguranca" match unrelated tenders.
 *
 * Example of v2 bug:
 *   Company: IT (CNAE 62), keyword "seguranca informacao"
 *   v2: Tokenized → {'seguranca', 'informacao'} individually
 *       → "segurança patrimonial" matched on 'seguranca' alone! ❌
 *   v3: Phrase → ['seguranca', 'informacao'] — ALL tokens must be present ✅
 *
 * Two-mode matching engine:
 *
 * MODE A — CNAE-Gated (when tender HAS CNAE classifications):
 *   1. Compute CNAE overlap between company and tender
 *   2. Hard gate: NO CNAE overlap → NO match (blocks irrelevant sectors)
 *   3. Score: CNAE (40%) + Keywords (35%) + Description (25%)
 *   4. Threshold: final_score >= 40
 *
 * MODE B — Keyword-Only (when tender has NO CNAE data):
 *   1. Match using phrase-level keyword matching
 *   2. Score: Keywords (60%) + Description (40%)
 *   3. Higher threshold: final_score >= 50 (compensates for no CNAE gate)
 *   4. Requires minimum 3 phrase matches to proceed
 */

import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { notificationQueue } from '../queues/notification.queue'
import { invalidateMatchCaches, incrementStat } from '../lib/redis-cache'
import { CNAE_DIVISIONS, getCompanyDivisions, NON_COMPETITIVE_MODALITIES, getCompanySectors, detectSectorConflict } from '@licitagram/shared'
import { classifyTenderCNAEs } from '../ai/cnae-classifier'

// ─── Scoring Constants ────────────────────────────────────────────────────

// Mode A: CNAE-gated scoring weights (tender HAS CNAE classification)
const CNAE_WEIGHT = 0.40
const KEYWORD_WEIGHT_A = 0.35
const DESCRIPTION_WEIGHT_A = 0.25
const MIN_MATCH_SCORE_A = 40

// Mode B: Keyword-only scoring weights (tender has NO CNAE data)
const KEYWORD_WEIGHT_B = 0.60
const DESCRIPTION_WEIGHT_B = 0.40
const MIN_MATCH_SCORE_B = 50     // Higher threshold — no CNAE gate
const MIN_PHRASE_MATCHES_B = 3   // Require at least 3 keyword phrases to match

const DIRECT_CNAE_SCORE = 100
const RELATED_CNAE_SCORE = 50

// PRECISION CAPS — keyword matching alone cannot give certainty
// Only AI analysis can push scores above these caps
const MAX_KEYWORD_SCORE_MODE_A = 75  // CNAE-gated: decent confidence but not certain
const MAX_KEYWORD_SCORE_MODE_B = 60  // Keyword-only: lower confidence, needs AI validation

// ─── Portuguese Stopwords (expanded) ──────────────────────────────────────

const STOPWORDS = new Set([
  // Common Portuguese words
  'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos', 'para',
  'com', 'por', 'uma', 'um', 'que', 'ao', 'aos', 'ou', 'e', 'o', 'a',
  'os', 'as', 'se', 'ser', 'como', 'mais', 'tem', 'tem', 'sua', 'seu', 'seus',
  'suas', 'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'isso',
  'aquele', 'aquela', 'nao', 'sim', 'muito', 'pouco', 'bem', 'mal',
  'ate', 'sobre', 'entre', 'apos', 'antes', 'durante', 'sob', 'contra',
  'desde', 'conforme', 'segundo', 'quando', 'onde', 'quem', 'qual',
  'quanto', 'todo', 'toda', 'todos', 'todas', 'cada', 'outro', 'outra',
  'outros', 'outras', 'mesmo', 'mesma', 'ja', 'ainda', 'tambem', 'apenas',
  // Licitação-specific stopwords (too generic to be useful)
  'contratacao', 'aquisicao', 'prestacao', 'servico', 'servicos', 'fornecimento',
  'empresa', 'objeto', 'licitacao', 'pregao', 'edital', 'item', 'itens',
  'lote', 'lotes', 'valor', 'preco', 'registro', 'precos', 'ata',
  'processo', 'numero', 'tipo', 'modalidade', 'orgao', 'entidade',
  'publica', 'publico', 'federal', 'estadual', 'municipal', 'governo',
  'secretaria', 'ministerio', 'departamento', 'diretoria', 'coordenacao',
  'referente', 'conforme', 'descrito', 'abaixo', 'acima', 'seguinte',
  'forma', 'modo', 'acordo', 'termos', 'condicoes', 'especificacoes',
  'atender', 'necessidade', 'demanda', 'solicitacao', 'requisicao',
])

// ─── Text Processing ──────────────────────────────────────────────────────

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
}

// ─── CNAE Score (Hierarchical) ────────────────────────────────────────────

function computeCNAEScore(companyCnaes: string[], tenderCnaeDivisions: string[]): number {
  if (companyCnaes.length === 0 || tenderCnaeDivisions.length === 0) return 0

  const { direct: companyDirectDivs, related: companyRelatedDivs } = getCompanyDivisions(companyCnaes)
  let bestScore = 0

  for (const tenderDiv of tenderCnaeDivisions) {
    if (companyDirectDivs.has(tenderDiv)) {
      bestScore = Math.max(bestScore, DIRECT_CNAE_SCORE)
      break
    }
    if (companyRelatedDivs.has(tenderDiv)) {
      bestScore = Math.max(bestScore, RELATED_CNAE_SCORE)
    }
  }

  return bestScore
}

// ─── Phrase-Based Keyword Score ───────────────────────────────────────────
//
// CRITICAL: Keywords are matched as complete phrases, not individual tokens.
// "seguranca informacao" only matches if BOTH tokens appear in the tender.
// Single-word keywords like "software" match normally.

function computePhraseScore(
  phrases: string[][],
  tenderTokens: Set<string>,
): { score: number; phraseMatches: number; matchedPhrases: string[] } {
  if (phrases.length === 0 || tenderTokens.size === 0) {
    return { score: 0, phraseMatches: 0, matchedPhrases: [] }
  }

  const matchedPhrases: string[] = []
  let weightedMatches = 0
  for (const phrase of phrases) {
    if (phrase.length > 0 && phrase.every((t) => tenderTokens.has(t))) {
      matchedPhrases.push(phrase.join(' '))
      // Multi-word phrases are stronger signals than single-word matches
      // 1 token = 0.3 weight (generic), 2 tokens = 0.7 (moderate), 3+ tokens = 1.0 (specific)
      weightedMatches += phrase.length === 1 ? 0.3 : phrase.length === 2 ? 0.7 : 1.0
    }
  }

  const phraseMatches = matchedPhrases.length
  if (phraseMatches === 0) return { score: 0, phraseMatches: 0, matchedPhrases: [] }

  // Score based on WEIGHTED phrase matches (not raw count)
  // Single-word generic matches contribute much less than multi-word specific phrases
  // This prevents "rede" + "sistema" + "dados" from inflating scores
  const score = Math.min(100, Math.round(100 * (1 - Math.exp(-weightedMatches * 0.18))))

  return { score, phraseMatches, matchedPhrases }
}

// ─── Build Company Keyword PHRASES (not individual tokens) ───────────────

function buildCompanyPhrases(company: {
  cnae_principal: string | null
  cnaes_secundarios: string[] | null
  palavras_chave: string[] | null
  descricao_servicos: string | null
  capacidades?: string[] | null
}): {
  cnaePhrases: string[][]       // Each keyword as array of tokens (phrase-level)
  userPhrases: string[][]       // Each user keyword as array of tokens
  descTokens: Set<string>       // Description tokens (individual, for bonus scoring)
  allCnaes: string[]
} {
  const cnaePhrases: string[][] = []
  const allCnaes: string[] = []
  if (company.cnae_principal) allCnaes.push(String(company.cnae_principal))
  if (Array.isArray(company.cnaes_secundarios)) {
    allCnaes.push(...(company.cnaes_secundarios as string[]))
  }

  // Build CNAE keyword phrases — each keyword stays as a complete phrase
  // DEDUPLICATE: prevent same phrase from multiple CNAEs inflating the count
  const seenPhrases = new Set<string>()
  for (const cnae of allCnaes) {
    const div = cnae.substring(0, 2)
    const division = CNAE_DIVISIONS[div]
    if (division) {
      for (const kw of division.keywords) {
        const tokens = tokenize(kw)
        const key = tokens.join('|')
        if (tokens.length > 0 && !seenPhrases.has(key)) {
          seenPhrases.add(key)
          cnaePhrases.push(tokens)
        }
      }
    }
  }

  // Build user keyword phrases — each keyword stays as a complete phrase
  // Also deduplicate against CNAE phrases
  const userPhrases: string[][] = []
  if (Array.isArray(company.palavras_chave)) {
    for (const kw of company.palavras_chave as string[]) {
      const tokens = tokenize(kw)
      const key = tokens.join('|')
      if (tokens.length > 0 && !seenPhrases.has(key)) {
        seenPhrases.add(key)
        userPhrases.push(tokens)
      }
    }
  }

  // Add capacidades as phrases too (deduplicated)
  if (Array.isArray(company.capacidades)) {
    for (const cap of company.capacidades as string[]) {
      const tokens = tokenize(cap)
      const key = tokens.join('|')
      if (tokens.length > 0 && !seenPhrases.has(key)) {
        seenPhrases.add(key)
        userPhrases.push(tokens)
      }
    }
  }

  // Description tokens (individual) — only used as a small bonus
  const descTokens = company.descricao_servicos && typeof company.descricao_servicos === 'string'
    ? new Set(tokenize(company.descricao_servicos))
    : new Set<string>()

  return { cnaePhrases, userPhrases, descTokens, allCnaes }
}

// ─── Description Score (individual token match, capped) ──────────────────

function computeDescScore(descTokens: Set<string>, tenderTokens: Set<string>): number {
  if (descTokens.size === 0 || tenderTokens.size === 0) return 0

  let matches = 0
  for (const token of descTokens) {
    if (tenderTokens.has(token)) matches++
  }

  if (matches === 0) return 0

  // Percentage-based only — description is a weak signal
  return Math.round((matches / descTokens.size) * 100)
}

// ─── Upsert Match + Notify Helper ────────────────────────────────────────

async function upsertMatchAndNotify(
  companyId: string,
  tenderId: string,
  finalScore: number,
  breakdown: Array<{ category: string; score: number; reason: string }>,
  matchSource: string,
): Promise<boolean> {
  // Check if match already exists WITH AI analysis — don't overwrite AI data
  const { data: existing } = await supabase
    .from('matches')
    .select('id, match_source, ai_justificativa')
    .eq('company_id', companyId)
    .eq('tender_id', tenderId)
    .single()

  if (existing?.match_source === 'ai' && existing?.ai_justificativa) {
    // Match was already AI-analyzed — only update keyword_score, don't touch AI fields
    const { error } = await supabase
      .from('matches')
      .update({ keyword_score: finalScore })
      .eq('id', existing.id)

    if (error) {
      logger.error({ companyId, tenderId, error }, 'Failed to update keyword_score on AI match')
      return false
    }
    return true // Match exists, not creating a new one
  }

  const { error } = await supabase.from('matches').upsert(
    {
      company_id: companyId,
      tender_id: tenderId,
      score: finalScore,
      keyword_score: finalScore,
      breakdown,
      ...(existing ? {} : {
        ai_justificativa: null,
        riscos: [],
        acoes_necessarias: [],
        recomendacao: null,
        match_source: matchSource,
        status: 'new',
      }),
    },
    { onConflict: 'company_id,tender_id', ignoreDuplicates: false },
  )

  if (error) {
    logger.error({ companyId, tenderId, error }, 'Failed to upsert match')
    return false
  }

  // Plan limit check
  try {
    const { data: limitCheck } = await supabase.rpc('increment_match_count', {
      p_company_id: companyId,
      p_amount: 1,
    })
    if (limitCheck?.[0]?.limit_reached) {
      logger.info({ companyId }, 'Match limit reached after this match')
    }
  } catch (limitErr) {
    logger.warn({ companyId, err: limitErr }, 'Match limit RPC failed (non-critical)')
  }

  await invalidateMatchCaches(companyId)
  await incrementStat('matches-today')
  await enqueueNotifications(companyId, tenderId, finalScore)

  return true
}

// ─── Main Matching Function (Phrase-Based, CNAE-Gated) ───────────────────
//
// When a new tender arrives, match it against ALL companies.
// Uses PHRASE-LEVEL matching (not individual tokens) to prevent false positives.
// When tender has CNAE classification, REQUIRES CNAE overlap (hard gate).

export async function runKeywordMatching(tenderId: string) {
  // 1. Fetch tender
  const { data: tender } = await supabase
    .from('tenders')
    .select('id, objeto, resumo, cnae_classificados, data_encerramento, modalidade_id')
    .eq('id', tenderId)
    .single()

  if (!tender || !tender.objeto) {
    logger.warn({ tenderId }, 'No tender or objeto for keyword matching')
    return
  }

  // Skip non-competitive modalities (inexigibilidade, inaplicabilidade) — no real competition
  if (tender.modalidade_id && NON_COMPETITIVE_MODALITIES.includes(tender.modalidade_id as any)) {
    logger.info({ tenderId, modalidade_id: tender.modalidade_id }, 'Skipping non-competitive tender (no matching)')
    return
  }

  // Skip expired tenders — don't create matches for already-closed tenders
  if (tender.data_encerramento) {
    const encerramento = new Date(tender.data_encerramento as string)
    if (encerramento < new Date()) {
      logger.info({ tenderId, data_encerramento: tender.data_encerramento }, 'Skipping expired tender (keyword matching)')
      return
    }
  }

  // 2. Try to get/classify CNAE data
  let tenderCnaes = (tender.cnae_classificados as string[]) || []
  if (tenderCnaes.length === 0) {
    try {
      tenderCnaes = await classifyTenderCNAEs(tenderId)
    } catch (err) {
      logger.warn({ tenderId, err }, 'CNAE classification failed, proceeding with keyword-only')
    }
  }

  // 3. Build tender tokens
  const objetoTokens = tokenize(tender.objeto)
  const resumoTokens = tender.resumo ? tokenize(tender.resumo as string) : []
  const tenderTokens = new Set([...objetoTokens, ...resumoTokens])

  // 4. Fetch ALL companies
  const { data: companies } = await supabase
    .from('companies')
    .select('id, cnae_principal, cnaes_secundarios, palavras_chave, descricao_servicos, capacidades')

  if (!companies || companies.length === 0) {
    logger.info('No companies found, skipping keyword matching')
    return
  }

  const hasTenderCnaes = tenderCnaes.length > 0
  let matchCount = 0

  // Build tender text for sector conflict detection
  const tenderFullText = tender.objeto + (tender.resumo ? ' ' + tender.resumo : '')

  // 5. Score each company using PHRASE-LEVEL matching
  for (const company of companies) {
    const { cnaePhrases, userPhrases, descTokens, allCnaes } = buildCompanyPhrases(company)

    // ── SECTOR CONFLICT GATE ──
    // If tender clearly belongs to a different sector (e.g., "material de construção"
    // for an IT company), block the match entirely. This prevents false positives
    // from generic keyword overlap.
    const companySectors = getCompanySectors(allCnaes)
    const conflict = detectSectorConflict(tenderFullText, companySectors)
    if (conflict) {
      continue // Skip — tender is from an incompatible sector
    }

    // Combine CNAE + user keyword phrases
    const allPhrases = [...cnaePhrases, ...userPhrases]

    // Phrase-level keyword matching
    const { score: kwScore, phraseMatches, matchedPhrases } = computePhraseScore(allPhrases, tenderTokens)
    const descScore = computeDescScore(descTokens, tenderTokens)

    // CNAE overlap check
    let cnaeScore = 0
    if (hasTenderCnaes && allCnaes.length > 0) {
      cnaeScore = computeCNAEScore(allCnaes, tenderCnaes)
    }

    let finalScore: number
    let minScore: number

    if (hasTenderCnaes) {
      // ── MODE A: CNAE-Gated ──
      // HARD GATE: if tender has CNAE classification and company has NO overlap → BLOCK
      if (cnaeScore === 0) continue

      finalScore = Math.min(
        MAX_KEYWORD_SCORE_MODE_A,
        Math.round(
          kwScore * KEYWORD_WEIGHT_A +
          cnaeScore * CNAE_WEIGHT +
          descScore * DESCRIPTION_WEIGHT_A,
        ),
      )
      minScore = MIN_MATCH_SCORE_A
    } else {
      // ── MODE B: Keyword-Only ──
      // Require minimum phrase matches to prevent noise
      if (phraseMatches < MIN_PHRASE_MATCHES_B) continue

      finalScore = Math.min(
        MAX_KEYWORD_SCORE_MODE_B,
        Math.round(
          kwScore * KEYWORD_WEIGHT_B +
          descScore * DESCRIPTION_WEIGHT_B,
        ),
      )
      minScore = MIN_MATCH_SCORE_B
    }

    if (finalScore < minScore) continue

    const matchedPhrasesStr = matchedPhrases.slice(0, 5).join(', ')
    const success = await upsertMatchAndNotify(
      company.id, tenderId, finalScore,
      [
        { category: 'keywords', score: kwScore, reason: `${phraseMatches} frases: ${matchedPhrasesStr}` },
        { category: 'description', score: descScore, reason: 'Descricao de servicos' },
        { category: 'cnae', score: cnaeScore, reason: cnaeScore > 0 ? `CNAE match: ${tenderCnaes.join(', ')}` : 'Sem classificacao CNAE' },
      ],
      'keyword',
    )
    if (success) matchCount++
  }

  if (matchCount > 0) {
    logger.info({ tenderId, matchCount }, 'Matches created (phrase-based v3)')
  }
}

// ─── Notification Enqueue Helper ──────────────────────────────────────────

async function enqueueNotifications(companyId: string, tenderId: string, score: number) {
  try {
    const { data: users } = await supabase
      .from('users')
      .select('id, telegram_chat_id, whatsapp_number, min_score, notification_preferences')
      .eq('company_id', companyId)

    if (!users || users.length === 0) return

    for (const user of users) {
      const prefs = (user.notification_preferences as Record<string, boolean>) || {}
      const hasTelegram = user.telegram_chat_id && prefs.telegram !== false
      const hasWhatsApp = user.whatsapp_number && prefs.whatsapp !== false

      // Skip if no notification channel is available
      if (!hasTelegram && !hasWhatsApp) continue

      const minScore = user.min_score ?? 60
      if (score < minScore) continue

      const { data: matchRow } = await supabase
        .from('matches')
        .select('id')
        .eq('company_id', companyId)
        .eq('tender_id', tenderId)
        .single()

      if (matchRow) {
        try {
          const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000))
          await notificationQueue.add(
            `kw-notify-${user.id}-${matchRow.id}`,
            {
              matchId: matchRow.id,
              telegramChatId: hasTelegram ? user.telegram_chat_id : undefined,
              whatsappNumber: hasWhatsApp ? user.whatsapp_number : undefined,
            },
            {
              jobId: `kw-${user.id}-${matchRow.id}-${hourBucket}`,
              attempts: 3,
              backoff: { type: 'exponential', delay: 3000 },
            },
          )
          logger.info(
            { userId: user.id, matchId: matchRow.id, score, channels: { telegram: !!hasTelegram, whatsapp: !!hasWhatsApp } },
            'Notification enqueued for match',
          )
        } catch (enqueueErr) {
          logger.debug({ matchId: matchRow.id, err: enqueueErr }, 'Skipped duplicate notification job')
        }
      }
    }
  } catch (notifErr) {
    logger.warn(
      { companyId, tenderId, err: notifErr },
      'Failed to enqueue notification for match',
    )
  }
}

// ─── Sweep: Processes Unmatched Tenders (classifies on-the-fly) ──────────

/**
 * Process tenders that have no matches yet.
 * For tenders without CNAE data, classifies on-the-fly then runs matching.
 * For tenders where AI classification fails, uses keyword-only matching.
 *
 * Optimization: only fetches tenders that have 0 matches (skips already-matched).
 */
export async function runKeywordMatchingSweep() {
  logger.info('Starting keyword matching sweep (unmatched tenders)...')

  let page = 0
  const pageSize = 200
  let totalProcessed = 0
  let totalMatched = 0
  let classified = 0

  while (true) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const today = new Date().toISOString().split('T')[0]
    const { data: tenders, error: queryErr } = await supabase
      .from('tenders')
      .select('id, cnae_classificados, modalidade_id')
      .gt('objeto', '')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`)
      .not('modalidade_id', 'in', `(${NON_COMPETITIVE_MODALITIES.join(',')})`)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (queryErr) {
      logger.error({ error: queryErr }, 'Sweep: query error')
      break
    }

    if (!tenders || tenders.length === 0) {
      if (page === 0) logger.info('Sweep: 0 tenders with non-empty objeto found')
      break
    }

    if (page === 0) logger.info({ count: tenders.length }, 'Sweep: first page of tenders fetched')

    // Filter to only tenders without any matches (batch check)
    const tenderIds = tenders.map((t) => t.id)
    const { data: existingMatches } = await supabase
      .from('matches')
      .select('tender_id')
      .in('tender_id', tenderIds)

    const tendersWithMatches = new Set(
      (existingMatches || []).map((m) => m.tender_id),
    )
    const unmatchedTenders = tenders.filter((t) => !tendersWithMatches.has(t.id))

    for (const tender of unmatchedTenders) {
      try {
        // Classify on-the-fly if needed
        const cnaes = (tender.cnae_classificados as string[]) || []
        if (cnaes.length === 0) {
          try {
            const result = await classifyTenderCNAEs(tender.id)
            if (result.length > 0) classified++
          } catch {
            // Classification failed — runKeywordMatching will use keyword-only mode
          }
        }

        await runKeywordMatching(tender.id)
        totalProcessed++

        // Check if matches were created
        const { count } = await supabase
          .from('matches')
          .select('id', { count: 'exact', head: true })
          .eq('tender_id', tender.id)

        if (count && count > 0) totalMatched++
      } catch (err) {
        logger.warn({ tenderId: tender.id, err }, 'Sweep matching failed for tender')
      }
    }

    if (tenders.length < pageSize) break
    page++
  }

  logger.info(
    { totalProcessed, totalMatched, classified },
    'Keyword matching sweep completed (unmatched tenders)',
  )
}
