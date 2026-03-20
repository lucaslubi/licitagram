/**
 * AI Competitor Relevance Engine
 *
 * Deeply analyzes and scores how relevant each competitor is to a company,
 * using contextual analysis (CNAEs, shared tender objects, service descriptions)
 * instead of naive co-occurrence counting.
 *
 * Uses DeepSeek V3 via callLLM with task type 'relevanceAnalysis'.
 */

import { callLLM, parseJsonResponse } from './llm-client'
import { logger } from '../lib/logger'

const RELEVANCE_SYSTEM_PROMPT = `Você é um analista especialista em licitações públicas brasileiras.
Sua tarefa é determinar o GRAU DE RELEVÂNCIA entre uma empresa e potenciais concorrentes.

PRINCÍPIO FUNDAMENTAL — COMPETIÇÃO CROSS-CNAE:
No mercado de licitações públicas brasileiras, empresas frequentemente competem FORA de sua divisão CNAE principal.
Isto é especialmente comum no setor de tecnologia:
- Empresas de TI (CNAE 62/63) competem rotineiramente contra consultorias de gestão (CNAE 70), engenharias (CNAE 71), telecoms (CNAE 61), empresas de educação/treinamento (CNAE 85), e gráficas/editoras (CNAE 58)
- Empresas de engenharia (CNAE 71) competem contra construtoras (CNAE 41/42/43) e consultorias (CNAE 70)
- Consultorias (CNAE 70) competem em praticamente TODOS os setores

NUNCA descarte um concorrente apenas por ter CNAE diferente. Analise a NATUREZA dos objetos licitados em comum.

EVIDÊNCIA DE CO-OCORRÊNCIA:
- Se duas empresas participaram de 10+ licitações em comum → são quase certamente concorrentes (score mínimo 70)
- Se participaram de 5+ licitações em comum → são provavelmente concorrentes (score mínimo 50)
- Se participaram de 3+ licitações em comum → há indícios de competição (score mínimo 30)
- A quantidade de co-ocorrências é um sinal FORTE que deve ser respeitado

ANÁLISE CONTEXTUAL PROFUNDA:
- NÃO compare apenas CNAEs — analise o CONTEXTO real dos serviços e objetos
- Analise os OBJETOS das licitações em que ambos participaram — isso revela se disputam o MESMO tipo de serviço
- Considere CNAEs secundários e a natureza real dos serviços prestados
- Empresas com muitas participações em comum são concorrentes até que se prove o contrário

TIPOS DE RELACIONAMENTO:
- "concorrente_direto": Disputa exatamente o mesmo tipo de serviço/produto (score 80-100)
- "concorrente_indireto": Oferece serviços substitutos ou complementares que podem competir (score 50-79)
- "potencial_parceiro": Serviços complementares, poderia ser subcontratado ou consórcio (score 30-49)
- "irrelevante": Não há relação de competição real (score 0-29)

REGRAS DE SCORING:
- Se ambas empresas são do mesmo setor (TI com TI, engenharia com engenharia) = score 70+
- Se competem nos mesmos objetos de licitação = score +20
- Se CNAEs são de setores diferentes MAS co-ocorrem em 5+ licitações = score 50+ (NÃO ignorar)
- Uma seguradora, associação de municípios, ou entidade sem fins lucrativos que aparece no mesmo pregão = score 5-10
- Seja GENEROSO com scores quando há evidência de co-ocorrência frequente

Para cada concorrente no lote, retorne um objeto JSON com:
{ "cnpj": string, "relevance_score": number (0-100), "relationship_type": string, "reason": string }

Retorne APENAS um array JSON válido (sem markdown).`

const RETRY_SYSTEM_PROMPT = `Você é um analista de licitações. Para cada concorrente, retorne APENAS um array JSON válido.
Formato: [{ "cnpj": "XX.XXX.XXX/XXXX-XX", "relevance_score": 0-100, "relationship_type": "concorrente_direto|concorrente_indireto|potencial_parceiro|irrelevante", "reason": "breve justificativa" }]
Retorne SOMENTE o JSON, sem markdown, sem explicações.`

export interface CompanyProfile {
  razao_social: string | null
  cnae_principal: string | null
  cnaes_secundarios: string[] | null
  descricao_servicos: string | null
  palavras_chave: string[] | null
}

export interface CompetitorProfile {
  cnpj: string
  razao_social: string | null
  cnae_codigo: string | null
  cnae_nome: string | null
  porte: string | null
  uf: string | null
  sharedTenderCount: number
}

export interface RelevanceResult {
  cnpj: string
  relevance_score: number
  relationship_type: 'concorrente_direto' | 'concorrente_indireto' | 'potencial_parceiro' | 'irrelevante'
  reason: string
}

/**
 * Fallback scoring based on shared tender count.
 * Ensures highly co-occurring competitors are never scored as irrelevant.
 */
function getMinimumScoreByCoOccurrence(sharedTenderCount: number): number {
  if (sharedTenderCount >= 10) return 70
  if (sharedTenderCount >= 5) return 50
  if (sharedTenderCount >= 3) return 30
  return 0
}

function getRelationshipTypeForScore(
  score: number,
): RelevanceResult['relationship_type'] {
  if (score >= 80) return 'concorrente_direto'
  if (score >= 50) return 'concorrente_indireto'
  if (score >= 30) return 'potencial_parceiro'
  return 'irrelevante'
}

function buildBatchPrompt(
  companyProfile: CompanyProfile,
  competitors: CompetitorProfile[],
  sharedTenderObjectsMap: Record<string, string[]>,
): string {
  const companySection = `EMPRESA ANALISADA:
- Razão Social: ${companyProfile.razao_social || 'N/A'}
- CNAE Principal: ${companyProfile.cnae_principal || 'N/A'}
- CNAEs Secundários: ${companyProfile.cnaes_secundarios?.join(', ') || 'N/A'}
- Descrição de Serviços: ${companyProfile.descricao_servicos?.slice(0, 500) || 'N/A'}
- Palavras-chave: ${companyProfile.palavras_chave?.join(', ') || 'N/A'}`

  const competitorEntries = competitors.map((c) => {
    const objects = sharedTenderObjectsMap[c.cnpj] || []
    const objectsSample = objects.slice(0, 5).map((o) => o.slice(0, 400))
    return `- CNPJ: ${c.cnpj}
  Razão Social: ${c.razao_social || 'Desconhecido'}
  CNAE: ${c.cnae_codigo || 'N/A'} — ${c.cnae_nome || 'N/A'}
  Porte: ${c.porte || 'N/A'} | UF: ${c.uf || 'N/A'}
  Licitações em comum: ${c.sharedTenderCount}
  Objetos de licitações em comum (amostra): ${objectsSample.length > 0 ? objectsSample.join(' | ') : 'Sem dados'}`
  })

  return `${companySection}

CONCORRENTES PARA AVALIAR (lote de ${competitors.length}):
${competitorEntries.join('\n')}

Analise cada concorrente e retorne um array JSON com a avaliação de relevância de cada um.
LEMBRE-SE: empresas com muitas licitações em comum são provavelmente concorrentes, mesmo com CNAEs diferentes.
Formato: [{ "cnpj": "...", "relevance_score": 0-100, "relationship_type": "concorrente_direto|concorrente_indireto|potencial_parceiro|irrelevante", "reason": "..." }]`
}

function buildRetryPrompt(
  companyProfile: CompanyProfile,
  competitors: CompetitorProfile[],
): string {
  const entries = competitors.map((c) =>
    `CNPJ: ${c.cnpj}, Nome: ${c.razao_social || '?'}, CNAE: ${c.cnae_codigo || '?'}, Licitações em comum: ${c.sharedTenderCount}`,
  ).join('\n')

  return `Empresa: ${companyProfile.razao_social || 'N/A'} (CNAE ${companyProfile.cnae_principal || 'N/A'})

Concorrentes:
${entries}

Retorne o array JSON com score e tipo para cada CNPJ.`
}

/**
 * Apply minimum score floor based on shared tender count.
 * Ensures that the AI cannot incorrectly score highly co-occurring competitors as irrelevant.
 */
function applyMinimumScoreFloor(
  result: RelevanceResult,
  competitor: CompetitorProfile,
): RelevanceResult {
  const minScore = getMinimumScoreByCoOccurrence(competitor.sharedTenderCount)
  if (result.relevance_score >= minScore) return result

  const adjustedScore = minScore
  const adjustedType = getRelationshipTypeForScore(adjustedScore)
  return {
    ...result,
    relevance_score: adjustedScore,
    relationship_type: adjustedType,
    reason: `${result.reason} [Score ajustado de ${result.relevance_score} para ${adjustedScore} — ${competitor.sharedTenderCount} licitações em comum]`,
  }
}

/**
 * Analyze relevance of a batch of competitors to a company.
 * Processes up to 8 competitors per LLM call to save tokens.
 */
export async function analyzeCompetitorRelevanceBatch(params: {
  companyProfile: CompanyProfile
  competitors: CompetitorProfile[]
  sharedTenderObjectsMap: Record<string, string[]>
}): Promise<RelevanceResult[]> {
  const { companyProfile, competitors, sharedTenderObjectsMap } = params

  if (competitors.length === 0) return []

  const BATCH_SIZE = 8
  const allResults: RelevanceResult[] = []

  for (let i = 0; i < competitors.length; i += BATCH_SIZE) {
    const batch = competitors.slice(i, i + BATCH_SIZE)
    const prompt = buildBatchPrompt(companyProfile, batch, sharedTenderObjectsMap)

    try {
      const response = await callLLM({
        task: 'relevanceAnalysis',
        system: RELEVANCE_SYSTEM_PROMPT,
        prompt,
        jsonMode: true,
      })

      let parsed: RelevanceResult[] | null = null

      if (response && response.trim().length > 0) {
        try {
          const raw = parseJsonResponse<RelevanceResult[] | { results: RelevanceResult[] }>(response)
          parsed = Array.isArray(raw) ? raw : (raw as { results: RelevanceResult[] }).results || []
        } catch (parseErr) {
          logger.warn(
            { responseSnippet: response.slice(0, 300), error: parseErr, batchStart: i },
            'Failed to parse relevance response, retrying with simpler prompt',
          )
        }
      } else {
        logger.warn(
          { batchStart: i, batchSize: batch.length },
          'Empty AI response for competitor relevance, retrying with simpler prompt',
        )
      }

      // Retry once with simpler prompt if first attempt failed
      if (!parsed) {
        try {
          const retryPrompt = buildRetryPrompt(companyProfile, batch)
          const retryResponse = await callLLM({
            task: 'relevanceAnalysis',
            system: RETRY_SYSTEM_PROMPT,
            prompt: retryPrompt,
            jsonMode: true,
          })

          if (retryResponse && retryResponse.trim().length > 0) {
            const raw = parseJsonResponse<RelevanceResult[] | { results: RelevanceResult[] }>(retryResponse)
            parsed = Array.isArray(raw) ? raw : (raw as { results: RelevanceResult[] }).results || []
            logger.info(
              { batchStart: i, resultsCount: parsed.length },
              'Retry succeeded for competitor relevance batch',
            )
          }
        } catch (retryErr) {
          logger.warn(
            { error: retryErr, batchStart: i },
            'Retry also failed for competitor relevance batch, using fallback scoring',
          )
        }
      }

      // If both attempts failed, use fallback scoring based on co-occurrence
      if (!parsed) {
        for (const c of batch) {
          const minScore = getMinimumScoreByCoOccurrence(c.sharedTenderCount)
          allResults.push({
            cnpj: c.cnpj,
            relevance_score: minScore,
            relationship_type: getRelationshipTypeForScore(minScore),
            reason: `Análise indisponível (falha na IA). Score baseado em ${c.sharedTenderCount} licitações em comum.`,
          })
        }
        continue
      }

      // Validate and normalize each result
      const validTypes = ['concorrente_direto', 'concorrente_indireto', 'potencial_parceiro', 'irrelevante'] as const
      for (const result of parsed) {
        if (!result.cnpj) continue

        const score = Math.max(0, Math.min(100, Math.round(Number(result.relevance_score) || 0)))
        const type = validTypes.includes(result.relationship_type as typeof validTypes[number])
          ? result.relationship_type
          : getRelationshipTypeForScore(score)

        const normalizedResult: RelevanceResult = {
          cnpj: result.cnpj,
          relevance_score: score,
          relationship_type: type as RelevanceResult['relationship_type'],
          reason: result.reason?.slice(0, 500) || 'Sem justificativa',
        }

        // Apply minimum score floor based on shared tender count
        const competitor = batch.find((c) => c.cnpj === result.cnpj)
        if (competitor) {
          allResults.push(applyMinimumScoreFloor(normalizedResult, competitor))
        } else {
          allResults.push(normalizedResult)
        }
      }

      // For any competitors in the batch that the LLM missed, use fallback scoring
      const processedCnpjs = new Set(parsed.map((r) => r.cnpj))
      for (const c of batch) {
        if (!processedCnpjs.has(c.cnpj)) {
          const minScore = getMinimumScoreByCoOccurrence(c.sharedTenderCount)
          allResults.push({
            cnpj: c.cnpj,
            relevance_score: minScore,
            relationship_type: getRelationshipTypeForScore(minScore),
            reason: `Não avaliado pela IA neste lote. Score baseado em ${c.sharedTenderCount} licitações em comum.`,
          })
        }
      }

      logger.info(
        { batchStart: i, batchSize: batch.length, resultsCount: parsed.length },
        'Competitor relevance batch analyzed',
      )
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 429 || status === 503) {
        logger.warn({ status, batchStart: i }, 'Rate limited during relevance analysis, rethrowing')
        throw err // Let BullMQ retry the whole job
      }

      logger.error(
        { err, batchStart: i, batchSize: batch.length },
        'Error in competitor relevance batch, using fallback scoring',
      )
      for (const c of batch) {
        const minScore = getMinimumScoreByCoOccurrence(c.sharedTenderCount)
        allResults.push({
          cnpj: c.cnpj,
          relevance_score: minScore,
          relationship_type: getRelationshipTypeForScore(minScore),
          reason: `Análise indisponível (erro de processamento). Score baseado em ${c.sharedTenderCount} licitações em comum.`,
        })
      }
    }

    // Throttle between batches
    if (i + BATCH_SIZE < competitors.length) {
      await new Promise((r) => setTimeout(r, 1500))
    }
  }

  return allResults
}
