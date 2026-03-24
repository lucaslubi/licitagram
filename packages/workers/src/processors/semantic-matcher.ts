/**
 * Semantic Matcher — 3-Layer Architecture
 *
 * Layer 1 (Recall): pgvector cosine similarity > 0.45
 *   → Fast approximate nearest-neighbor via HNSW index
 *   → Returns ~200 candidate tenders per company
 *
 * Layer 2 (Precision): CNAE soft-scoring + keyword context
 *   → Filters false positives from embedding similarity
 *   → Boosts matches with CNAE overlap
 *   → Produces a combined score
 *
 * Layer 3 (Ranking): LLM judge for borderline cases (50-70 score)
 *   → DeepSeek confirms/rejects with a final score
 *   → Only called for ambiguous matches to save tokens
 *
 * Final: Creates/updates matches in DB with match_source='semantic'
 */

import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { CNAE_DIVISIONS, getCompanyDivisions } from '@licitagram/shared'
import { invalidateMatchCaches } from '../lib/redis-cache'
import { callLLM, parseJsonResponse } from '../ai/llm-client'
import { profileCompany, buildTenderText } from './company-profiler'
import { generateEmbedding, formatVector } from '../ai/embedding-client'
import { notificationQueue } from '../queues/notification.queue'
import { aiTriageQueue } from '../queues/ai-triage.queue'

// ─── Constants ──────────────────────────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.45    // Layer 1: minimum cosine similarity
const RECALL_LIMIT = 200             // Layer 1: max candidates per company
const MIN_FINAL_SCORE = 40           // Minimum score to create a match
const LLM_JUDGE_MIN = 50            // Layer 3: only judge scores in [50, 70]
const LLM_JUDGE_MAX = 70

// Layer 2 scoring weights
const SIMILARITY_WEIGHT = 0.50       // Embedding similarity contribution
const CNAE_WEIGHT = 0.30             // CNAE overlap contribution
const KEYWORD_WEIGHT = 0.20          // Keyword overlap contribution

// ─── Layer 1: Recall (pgvector) ─────────────────────────────────────────────

// Non-competitive modalities that should never generate matches/notifications
const NON_COMPETITIVE_MODALITIES = [9, 12, 14] // Inexigibilidade, Credenciamento, Inaplicabilidade
const NON_COMPETITIVE_NAMES = ['inexigibilidade', 'credenciamento']

interface RecallCandidate {
  id: string
  objeto: string
  orgao_nome: string | null
  uf: string | null
  modalidade_nome: string | null
  modalidade_id: number | null
  valor_estimado: number | null
  data_abertura: string | null
  data_encerramento: string | null
  similarity: number
}

async function recallByEmbedding(companyId: string): Promise<RecallCandidate[]> {
  // Get company embedding
  const { data: company } = await supabase
    .from('companies')
    .select('embedding')
    .eq('id', companyId)
    .single()

  if (!company?.embedding) {
    // Try to profile on-the-fly
    logger.info({ companyId }, 'Company has no embedding, profiling now')
    const ok = await profileCompany(companyId)
    if (!ok) return []

    const { data: refreshed } = await supabase
      .from('companies')
      .select('embedding')
      .eq('id', companyId)
      .single()

    if (!refreshed?.embedding) return []

    return callMatchFunction(refreshed.embedding as string)
  }

  return callMatchFunction(company.embedding as string)
}

async function callMatchFunction(embeddingStr: string): Promise<RecallCandidate[]> {
  const { data, error } = await supabase.rpc('match_tenders_by_embedding', {
    query_embedding: embeddingStr,
    similarity_threshold: SIMILARITY_THRESHOLD,
    match_count: RECALL_LIMIT,
  })

  if (error) {
    logger.error({ error }, 'match_tenders_by_embedding RPC failed')
    return []
  }

  return (data || []) as RecallCandidate[]
}

// ─── Layer 2: Precision (CNAE + Keywords) ───────────────────────────────────

interface PrecisionResult {
  tenderId: string
  objeto: string
  similarity: number
  cnaeScore: number
  keywordScore: number
  combinedScore: number
  orgao_nome: string | null
  uf: string | null
  modalidade_nome: string | null
  valor_estimado: number | null
  data_abertura: string | null
  data_encerramento: string | null
}

function computePrecisionScores(
  candidates: RecallCandidate[],
  companyDivisions: Set<string>,
  companyKeywords: string[],
): PrecisionResult[] {
  const results: PrecisionResult[] = []

  for (const candidate of candidates) {
    const objetoLower = (candidate.objeto || '').toLowerCase()

    // CNAE score: check if tender's text matches company CNAE divisions
    let cnaeScore = 0
    for (const division of companyDivisions) {
      const div = CNAE_DIVISIONS[division]
      if (!div) continue

      // Check if any CNAE keywords appear in the tender objeto
      const matchedKeywords = div.keywords.filter((kw) =>
        objetoLower.includes(kw.toLowerCase())
      )
      if (matchedKeywords.length > 0) {
        // More keyword matches = higher score
        cnaeScore = Math.min(100, cnaeScore + 30 + matchedKeywords.length * 10)
      }
    }

    // Keyword score: check company keywords against tender objeto
    let kwMatches = 0
    for (const kw of companyKeywords) {
      if (kw.length >= 3 && objetoLower.includes(kw.toLowerCase())) {
        kwMatches++
      }
    }
    const keywordScore = companyKeywords.length > 0
      ? Math.min(100, (kwMatches / Math.max(1, Math.min(companyKeywords.length, 5))) * 100)
      : 50 // Neutral if no keywords

    // Similarity is 0-1, scale to 0-100
    const simScore = candidate.similarity * 100

    // Combined score
    const combinedScore = Math.round(
      simScore * SIMILARITY_WEIGHT +
      cnaeScore * CNAE_WEIGHT +
      keywordScore * KEYWORD_WEIGHT
    )

    results.push({
      tenderId: candidate.id,
      objeto: candidate.objeto,
      similarity: candidate.similarity,
      cnaeScore,
      keywordScore,
      combinedScore,
      orgao_nome: candidate.orgao_nome,
      uf: candidate.uf,
      modalidade_nome: candidate.modalidade_nome,
      valor_estimado: candidate.valor_estimado,
      data_abertura: candidate.data_abertura,
      data_encerramento: candidate.data_encerramento,
    })
  }

  // Sort by combined score descending
  results.sort((a, b) => b.combinedScore - a.combinedScore)
  return results
}

// ─── Layer 3: LLM Judge (borderline cases) ─────────────────────────────────

const JUDGE_SYSTEM_PROMPT = `Voce e um juiz de compatibilidade entre empresas e licitacoes.
Recebe o perfil de uma empresa e o objeto de uma licitacao.
Responda com JSON: {"score": 0-100, "recomendacao": "participar|avaliar_melhor|nao_recomendado", "reason": "1 frase"}

REGRAS:
- score 0-25: TOTALMENTE incompativel
- score 26-50: alguma relacao mas ramos diferentes
- score 51-75: empresa poderia participar
- score 76-100: objeto alinhado com atividades da empresa
- Seja PRECISO. Nao infle scores.`

async function llmJudge(
  companyContext: string,
  items: Array<{ tenderId: string; objeto: string }>,
): Promise<Map<string, { score: number; recomendacao: string }>> {
  const results = new Map<string, { score: number; recomendacao: string }>()

  if (items.length === 0) return results

  const tenderList = items
    .map((item, i) => `${i + 1}. [${item.tenderId}] ${item.objeto.slice(0, 200)}`)
    .join('\n')

  const prompt = `${companyContext}

---

Avalie CADA licitacao abaixo. Retorne um JSON array:

LICITACOES:
${tenderList}

Retorne APENAS JSON valido:
[{"tenderId": "id", "score": 0-100, "recomendacao": "participar|avaliar_melhor|nao_recomendado"}]`

  try {
    const response = await callLLM({
      task: 'matching',
      system: JUDGE_SYSTEM_PROMPT,
      prompt,
      jsonMode: true,
    })

    const parsed = parseJsonResponse<
      Array<{ tenderId: string; score: number; recomendacao: string }>
    >(response)

    const arr = Array.isArray(parsed) ? parsed : []
    for (const item of arr) {
      if (item.tenderId && typeof item.score === 'number') {
        results.set(item.tenderId, {
          score: Math.min(100, Math.max(0, Math.round(item.score))),
          recomendacao: item.recomendacao || 'avaliar_melhor',
        })
      }
    }
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'LLM judge failed')
  }

  return results
}

// ─── Main: Run Semantic Matching for a Company ──────────────────────────────

export async function runSemanticMatching(companyId: string): Promise<{
  created: number
  updated: number
  skipped: number
}> {
  const stats = { created: 0, updated: 0, skipped: 0 }

  // Fetch company data
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single()

  if (!company) {
    logger.error({ companyId }, 'Company not found for semantic matching')
    return stats
  }

  // Layer 1: Recall
  logger.info({ companyId }, 'Layer 1: Recall by embedding similarity')
  const candidates = await recallByEmbedding(companyId)

  if (candidates.length === 0) {
    logger.info({ companyId }, 'No recall candidates found')
    return stats
  }

  // Filter out non-competitive modalities (inexigibilidade, credenciamento, inaplicabilidade)
  const beforeFilter = candidates.length
  const filteredCandidates = candidates.filter(
    (c) => {
      if (c.modalidade_id && NON_COMPETITIVE_MODALITIES.includes(c.modalidade_id)) return false
      if (c.modalidade_nome && NON_COMPETITIVE_NAMES.some(n => (c.modalidade_nome as string).toLowerCase().includes(n))) return false
      return true
    }
  )
  if (filteredCandidates.length < beforeFilter) {
    logger.info(
      { companyId, removed: beforeFilter - filteredCandidates.length },
      'Filtered non-competitive modalities from recall candidates',
    )
  }

  if (filteredCandidates.length === 0) {
    logger.info({ companyId }, 'No candidates after non-competitive modality filter')
    return stats
  }
  logger.info({ companyId, candidates: filteredCandidates.length }, 'Recall candidates found')

  // Layer 2: Precision
  const allCnaes: string[] = []
  if (company.cnae_principal) allCnaes.push(String(company.cnae_principal))
  if (Array.isArray(company.cnaes_secundarios)) allCnaes.push(...(company.cnaes_secundarios as string[]))
  const { direct: companyDivisions } = getCompanyDivisions(allCnaes)
  const companyKeywords = [
    ...((company.palavras_chave as string[]) || []),
    ...((company.capacidades as string[]) || []),
  ]

  const precisionResults = computePrecisionScores(filteredCandidates, companyDivisions, companyKeywords)

  // Filter: only keep scores >= MIN_FINAL_SCORE
  const aboveThreshold = precisionResults.filter((r) => r.combinedScore >= MIN_FINAL_SCORE)
  logger.info(
    { companyId, aboveThreshold: aboveThreshold.length, total: precisionResults.length },
    'Layer 2: Precision filtering done',
  )

  // Layer 3: LLM judge for borderline cases
  const borderline = aboveThreshold.filter(
    (r) => r.combinedScore >= LLM_JUDGE_MIN && r.combinedScore <= LLM_JUDGE_MAX,
  )

  let judgeResults = new Map<string, { score: number; recomendacao: string }>()

  if (borderline.length > 0) {
    logger.info({ companyId, borderline: borderline.length }, 'Layer 3: LLM judging borderline cases')

    // Build company context for judge
    const companyContext = buildCompanyContextForJudge(company as Record<string, unknown>)

    // Process in batches of 20
    const JUDGE_BATCH = 20
    for (let i = 0; i < borderline.length; i += JUDGE_BATCH) {
      const batch = borderline.slice(i, i + JUDGE_BATCH)
      const batchResults = await llmJudge(
        companyContext,
        batch.map((b) => ({ tenderId: b.tenderId, objeto: b.objeto })),
      )
      for (const [k, v] of batchResults) judgeResults.set(k, v)

      if (i + JUDGE_BATCH < borderline.length) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
  }

  // Fetch existing matches to avoid duplicates
  const tenderIds = aboveThreshold.map((r) => r.tenderId)
  const { data: existingMatches } = await supabase
    .from('matches')
    .select('id, tender_id, score, match_source')
    .eq('company_id', companyId)
    .in('tender_id', tenderIds)

  const existingMap = new Map(
    (existingMatches || []).map((m) => [m.tender_id, m]),
  )

  // Create/update matches
  const newMatchIds: string[] = []

  for (const result of aboveThreshold) {
    // Determine final score
    let finalScore = result.combinedScore
    let recomendacao = 'avaliar_melhor'

    // If LLM judged this tender, use the judge's score
    const judgeResult = judgeResults.get(result.tenderId)
    if (judgeResult) {
      finalScore = judgeResult.score
      recomendacao = judgeResult.recomendacao
    } else if (finalScore >= 70) {
      recomendacao = 'participar'
    } else if (finalScore < 40) {
      // Below threshold after judge (shouldn't happen but safety)
      stats.skipped++
      continue
    }

    // Skip if below threshold after LLM judge adjustment
    if (finalScore < MIN_FINAL_SCORE) {
      stats.skipped++
      continue
    }

    // Set recomendacao based on final score
    if (finalScore >= 70) recomendacao = 'participar'
    else if (finalScore < 50) recomendacao = 'nao_recomendado'

    const existing = existingMap.get(result.tenderId)

    if (existing) {
      // Don't downgrade an existing AI or AI triage score
      if (
        (existing.match_source === 'ai' || existing.match_source === 'ai_triage') &&
        (existing.score as number) >= finalScore
      ) {
        stats.skipped++
        continue
      }

      // Update existing match
      const { error } = await supabase
        .from('matches')
        .update({
          score: finalScore,
          match_source: 'semantic',
          recomendacao,
          analyzed_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      if (!error) stats.updated++
      else stats.skipped++
    } else {
      // Create new match (upsert to prevent duplicates)
      const { data: newMatch, error } = await supabase
        .from('matches')
        .upsert({
          company_id: companyId,
          tender_id: result.tenderId,
          score: finalScore,
          match_source: 'semantic',
          recomendacao,
          status: 'new',
          breakdown: [],
          analyzed_at: new Date().toISOString(),
        }, { onConflict: 'company_id,tender_id', ignoreDuplicates: false })
        .select('id')
        .single()

      if (!error && newMatch) {
        stats.created++
        newMatchIds.push(newMatch.id)
      } else {
        stats.skipped++
      }
    }
  }

  // Enqueue AI triage for new semantic matches (to get detailed breakdown)
  if (newMatchIds.length > 0) {
    try {
      await aiTriageQueue.add(
        `semantic-triage-${companyId}`,
        { companyId, matchIds: newMatchIds },
        { jobId: `semantic-triage-${companyId}-${Date.now()}` },
      )
      logger.info({ companyId, count: newMatchIds.length }, 'Enqueued semantic matches for AI triage')
    } catch (err) {
      logger.error({ companyId, err }, 'Failed to enqueue semantic matches for AI triage')
    }
  }

  // Invalidate caches
  try {
    await invalidateMatchCaches(companyId)
  } catch (err) {
    logger.error({ companyId, err }, 'Failed to invalidate match caches after semantic matching')
  }

  // Trigger notifications for new matches (one job per match)
  for (const matchId of newMatchIds) {
    try {
      await notificationQueue.add(
        `semantic-notify-${matchId}`,
        { matchId },
        { jobId: `semantic-notify-${matchId}` },
      )
    } catch (err) {
      logger.error({ matchId, err }, 'Failed to enqueue semantic notification job')
    }
  }

  logger.info({ companyId, ...stats }, 'Semantic matching complete')
  return stats
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function buildCompanyContextForJudge(company: Record<string, unknown>): string {
  const parts: string[] = []
  if (company.razao_social) parts.push(`Empresa: ${company.razao_social}`)

  const allCnaes: string[] = []
  if (company.cnae_principal) allCnaes.push(String(company.cnae_principal))
  if (Array.isArray(company.cnaes_secundarios)) allCnaes.push(...(company.cnaes_secundarios as string[]))

  const cnaeTexts: string[] = []
  for (const cnae of allCnaes) {
    const division = cnae.substring(0, 2)
    const div = CNAE_DIVISIONS[division]
    if (div) cnaeTexts.push(`${cnae}: ${div.nome}`)
  }
  if (cnaeTexts.length > 0) parts.push(`CNAEs:\n${cnaeTexts.join('\n')}`)

  if (company.descricao_servicos) parts.push(`Servicos: ${String(company.descricao_servicos).slice(0, 800)}`)
  if (Array.isArray(company.palavras_chave) && (company.palavras_chave as string[]).length > 0) {
    parts.push(`Palavras-chave: ${(company.palavras_chave as string[]).join(', ')}`)
  }

  return parts.join('\n')
}

// ─── Sweep: Run semantic matching for all companies ─────────────────────────

export async function runSemanticMatchingSweep(): Promise<void> {
  const { data: companies } = await supabase
    .from('companies')
    .select('id')
    .not('embedding', 'is', null)

  if (!companies || companies.length === 0) {
    logger.info('No profiled companies for semantic matching sweep')
    return
  }

  logger.info({ count: companies.length }, 'Starting semantic matching sweep')

  let totalCreated = 0
  let totalUpdated = 0

  for (const company of companies) {
    try {
      const stats = await runSemanticMatching(company.id)
      totalCreated += stats.created
      totalUpdated += stats.updated
    } catch (err) {
      logger.error({ companyId: company.id, err: (err as Error).message }, 'Semantic matching failed for company')
    }

    // Delay between companies
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  logger.info({ totalCreated, totalUpdated, companies: companies.length }, 'Semantic matching sweep complete')
}
