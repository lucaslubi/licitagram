/**
 * CNAE-First Keyword Matcher (v2 — High Precision)
 *
 * Two-mode matching engine:
 *
 * MODE A — CNAE-First (when tender has CNAE classifications):
 *   1. Filter companies by CNAE overlap (direct or related)
 *   2. Score: CNAE (55%) + Keywords (25%) + Description (20%)
 *   3. Hard gate: cnae_score == 0 → NO match
 *   4. Threshold: final_score >= 40
 *
 * MODE B — Keyword-Only (when tender has NO CNAE data):
 *   1. Match ALL companies using keyword + description tokens
 *   2. Score: Keywords (60%) + Description (40%)
 *   3. Higher threshold: final_score >= 55 (compensates for no CNAE gate)
 *   4. Ensures NO tender is completely ignored
 *
 * Sweep processes ALL tenders (not just CNAE-classified ones),
 * classifying on-the-fly when needed.
 */

import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { notificationQueue } from '../queues/notification.queue'
import { invalidateMatchCaches, incrementStat } from '../lib/redis-cache'
import { CNAE_DIVISIONS, RELATED_DIVISIONS, getCompanyDivisions } from '@licitagram/shared'
import { classifyTenderCNAEs } from '../ai/cnae-classifier'

// ─── Scoring Constants ────────────────────────────────────────────────────

// Mode A: CNAE-first scoring weights
const CNAE_WEIGHT = 0.55
const KEYWORD_WEIGHT = 0.25
const DESCRIPTION_WEIGHT = 0.20
const MIN_MATCH_SCORE = 40

// Mode B: Keyword-only scoring weights (no CNAE data available)
const KW_ONLY_KEYWORD_WEIGHT = 0.60
const KW_ONLY_DESCRIPTION_WEIGHT = 0.40
const KW_ONLY_MIN_SCORE = 55 // Higher threshold to compensate for no CNAE gate

const DIRECT_CNAE_SCORE = 100
const RELATED_CNAE_SCORE = 50

// ─── Portuguese Stopwords (expanded) ──────────────────────────────────────

const STOPWORDS = new Set([
  // Common Portuguese words
  'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos', 'para',
  'com', 'por', 'uma', 'um', 'que', 'ao', 'aos', 'ou', 'e', 'o', 'a',
  'os', 'as', 'se', 'ser', 'como', 'mais', 'tem', 'sua', 'seu', 'seus',
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

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(text: string): string[] {
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

// ─── Keyword Score (Exact Token Match Only) ───────────────────────────────

function computeKeywordScore(
  companyTokens: Set<string>,
  tenderTokens: Set<string>,
): number {
  if (companyTokens.size === 0 || tenderTokens.size === 0) return 0

  let matches = 0
  for (const token of companyTokens) {
    if (tenderTokens.has(token)) {
      matches++
    }
  }

  return Math.min(100, Math.round((matches / companyTokens.size) * 100))
}

// ─── Build Company Keyword Tokens ─────────────────────────────────────────

function buildCompanyTokenSets(company: {
  cnae_principal: string | null
  cnaes_secundarios: string[] | null
  palavras_chave: string[] | null
  descricao_servicos: string | null
}): {
  cnaeKeywords: Set<string>
  userKeywords: Set<string>
  descKeywords: Set<string>
  allCnaes: string[]
} {
  const cnaeKeywords = new Set<string>()
  const allCnaes: string[] = []
  if (company.cnae_principal) allCnaes.push(String(company.cnae_principal))
  if (Array.isArray(company.cnaes_secundarios)) {
    allCnaes.push(...(company.cnaes_secundarios as string[]))
  }

  for (const cnae of allCnaes) {
    const div = cnae.substring(0, 2)
    const division = CNAE_DIVISIONS[div]
    if (division) {
      for (const kw of division.keywords) {
        for (const token of tokenize(kw)) {
          cnaeKeywords.add(token)
        }
      }
    }
  }

  const userKeywords = new Set<string>()
  if (Array.isArray(company.palavras_chave)) {
    for (const kw of company.palavras_chave as string[]) {
      for (const token of tokenize(kw)) {
        userKeywords.add(token)
      }
    }
  }

  const descKeywords = company.descricao_servicos && typeof company.descricao_servicos === 'string'
    ? new Set(tokenize(company.descricao_servicos))
    : new Set<string>()

  return { cnaeKeywords, userKeywords, descKeywords, allCnaes }
}

// ─── Upsert Match + Notify Helper ────────────────────────────────────────

async function upsertMatchAndNotify(
  companyId: string,
  tenderId: string,
  finalScore: number,
  breakdown: Array<{ category: string; score: number; reason: string }>,
  matchSource: string,
): Promise<boolean> {
  const { error } = await supabase.from('matches').upsert(
    {
      company_id: companyId,
      tender_id: tenderId,
      score: finalScore,
      keyword_score: finalScore,
      breakdown,
      ai_justificativa: null,
      riscos: [],
      acoes_necessarias: [],
      recomendacao: null,
      match_source: matchSource,
      status: 'new',
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

// ─── Main Matching Function ───────────────────────────────────────────────

export async function runKeywordMatching(tenderId: string) {
  // 1. Fetch tender
  const { data: tender } = await supabase
    .from('tenders')
    .select('id, objeto, resumo, cnae_classificados')
    .eq('id', tenderId)
    .single()

  if (!tender || !tender.objeto) {
    logger.warn({ tenderId }, 'No tender or objeto for keyword matching')
    return
  }

  // 2. Try to get/classify CNAE data (non-blocking — don't skip if it fails)
  let tenderCnaes = (tender.cnae_classificados as string[]) || []
  if (tenderCnaes.length === 0) {
    try {
      tenderCnaes = await classifyTenderCNAEs(tenderId)
    } catch (err) {
      logger.warn({ tenderId, err }, 'CNAE classification failed, will use keyword-only mode')
    }
  }

  const hasCnaeData = tenderCnaes.length > 0

  // 3. Build tender tokens
  const objetoTokens = tokenize(tender.objeto)
  const resumoTokens = tender.resumo ? tokenize(tender.resumo as string) : []
  const tenderTokens = new Set([...objetoTokens, ...resumoTokens])

  // 4. Fetch ALL companies
  const { data: companies } = await supabase
    .from('companies')
    .select('id, cnae_principal, cnaes_secundarios, palavras_chave, descricao_servicos')

  if (!companies || companies.length === 0) {
    logger.info('No companies found, skipping keyword matching')
    return
  }

  let matchCount = 0

  if (hasCnaeData) {
    // ═══════════════════════════════════════════════════════════════════
    // MODE A: CNAE-First matching (tender has CNAE classifications)
    // ═══════════════════════════════════════════════════════════════════

    const relatedDivisions = new Set<string>()
    for (const div of tenderCnaes) {
      const related = RELATED_DIVISIONS[div]
      if (related) {
        for (const r of related) relatedDivisions.add(r)
      }
    }
    for (const div of tenderCnaes) {
      relatedDivisions.delete(div)
    }
    const allRelevantDivisions = [...tenderCnaes, ...relatedDivisions]

    // Filter companies by CNAE overlap
    const compatibleCompanies = companies.filter((company) => {
      const compCnaes: string[] = []
      if (company.cnae_principal) compCnaes.push(String(company.cnae_principal))
      if (Array.isArray(company.cnaes_secundarios)) {
        compCnaes.push(...(company.cnaes_secundarios as string[]))
      }
      for (const cnae of compCnaes) {
        const div = cnae.substring(0, 2)
        if (allRelevantDivisions.includes(div)) return true
      }
      return false
    })

    if (compatibleCompanies.length > 0) {
      logger.info(
        { tenderId, tenderCnaes, totalCompanies: companies.length, compatibleCompanies: compatibleCompanies.length },
        'MODE A: CNAE-filtered companies for matching',
      )

      for (const company of compatibleCompanies) {
        const { cnaeKeywords, userKeywords, descKeywords, allCnaes } = buildCompanyTokenSets(company)

        const cnaeScore = computeCNAEScore(allCnaes, tenderCnaes)
        if (cnaeScore === 0) continue // HARD GATE: No CNAE match

        const kwScore = computeKeywordScore(userKeywords, tenderTokens)
        const descScore = computeKeywordScore(descKeywords, tenderTokens)

        const finalScore = Math.round(
          cnaeScore * CNAE_WEIGHT +
          kwScore * KEYWORD_WEIGHT +
          descScore * DESCRIPTION_WEIGHT,
        )

        if (finalScore < MIN_MATCH_SCORE) continue

        const success = await upsertMatchAndNotify(
          company.id, tenderId, finalScore,
          [
            { category: 'cnae', score: cnaeScore, reason: `CNAE: ${tenderCnaes.join(', ')}` },
            { category: 'keywords', score: kwScore, reason: 'Palavras-chave da empresa' },
            { category: 'description', score: descScore, reason: 'Descricao de servicos' },
          ],
          'cnae-first',
        )
        if (success) matchCount++
      }
    } else {
      logger.debug({ tenderId, tenderCnaes }, 'No CNAE-compatible companies for this tender')
    }
  } else {
    // ═══════════════════════════════════════════════════════════════════
    // MODE B: Keyword-Only matching (no CNAE data available)
    // Uses higher threshold to compensate for missing CNAE gate
    // ═══════════════════════════════════════════════════════════════════

    logger.info({ tenderId }, 'MODE B: Keyword-only matching (no CNAE data)')

    for (const company of companies) {
      const { userKeywords, descKeywords } = buildCompanyTokenSets(company)

      // Combine user keywords + CNAE-derived keywords for richer matching
      const { cnaeKeywords } = buildCompanyTokenSets(company)
      const combinedKeywords = new Set([...userKeywords, ...cnaeKeywords])

      const kwScore = computeKeywordScore(combinedKeywords, tenderTokens)
      const descScore = computeKeywordScore(descKeywords, tenderTokens)

      // Keyword-only scoring — higher weights for keyword & description
      const finalScore = Math.round(
        kwScore * KW_ONLY_KEYWORD_WEIGHT +
        descScore * KW_ONLY_DESCRIPTION_WEIGHT,
      )

      if (finalScore < KW_ONLY_MIN_SCORE) continue

      const success = await upsertMatchAndNotify(
        company.id, tenderId, finalScore,
        [
          { category: 'cnae', score: 0, reason: 'CNAE nao classificado (keyword-only)' },
          { category: 'keywords', score: kwScore, reason: 'Palavras-chave + CNAE keywords' },
          { category: 'description', score: descScore, reason: 'Descricao de servicos' },
        ],
        'keyword-only',
      )
      if (success) matchCount++
    }
  }

  if (matchCount > 0) {
    logger.info({ tenderId, matchCount, mode: hasCnaeData ? 'cnae-first' : 'keyword-only' }, 'Matches created')
  }
}

// ─── Notification Enqueue Helper ──────────────────────────────────────────

async function enqueueNotifications(companyId: string, tenderId: string, score: number) {
  try {
    const { data: users } = await supabase
      .from('users')
      .select('id, telegram_chat_id, min_score, notification_preferences')
      .eq('company_id', companyId)
      .not('telegram_chat_id', 'is', null)

    if (!users || users.length === 0) return

    for (const user of users) {
      const prefs = (user.notification_preferences as Record<string, boolean>) || {}
      if (prefs.telegram === false) continue
      const minScore = user.min_score ?? 60
      if (score < minScore) continue

      const { data: matchRow } = await supabase
        .from('matches')
        .select('id')
        .eq('company_id', companyId)
        .eq('tender_id', tenderId)
        .single()

      if (matchRow) {
        await notificationQueue.add(
          `kw-notify-${user.id}-${matchRow.id}`,
          {
            matchId: matchRow.id,
            telegramChatId: user.telegram_chat_id,
          },
          {
            jobId: `kw-${user.id}-${matchRow.id}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 3000 },
          },
        )
        logger.info(
          { userId: user.id, matchId: matchRow.id, score },
          'Notification enqueued for match',
        )
      }
    }
  } catch (notifErr) {
    logger.warn(
      { companyId, tenderId, err: notifErr },
      'Failed to enqueue notification for match',
    )
  }
}

// ─── Sweep: Processes ALL Tenders (classifies on-the-fly) ─────────────────

/**
 * Process ALL tenders — not just those with CNAE classifications.
 * For tenders without CNAE data, classifies on-the-fly then runs matching.
 * For tenders where AI classification fails, uses keyword-only matching.
 */
export async function runKeywordMatchingSweep() {
  logger.info('Starting keyword matching sweep (ALL tenders)...')

  let page = 0
  const pageSize = 200
  let totalProcessed = 0
  let classified = 0

  while (true) {
    const { data: tenders } = await supabase
      .from('tenders')
      .select('id, cnae_classificados')
      .not('objeto', 'is', null)
      // NO cnae_classificados filter — processes ALL tenders
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (!tenders || tenders.length === 0) break

    for (const tender of tenders) {
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
      } catch (err) {
        logger.warn({ tenderId: tender.id, err }, 'Sweep matching failed for tender')
      }
    }

    if (tenders.length < pageSize) break
    page++
  }

  logger.info({ totalProcessed, classified }, 'Keyword matching sweep completed (ALL tenders)')
}
