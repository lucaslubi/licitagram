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

ANÁLISE CONTEXTUAL PROFUNDA:
- NÃO compare apenas CNAEs — analise o CONTEXTO dos serviços
- Uma empresa de TI (CNAE 6202) compete com: outras empresas de TI, consultorias de gestão que fazem sistemas, empresas de telecom que oferecem soluções digitais
- NÃO são concorrentes: seguradoras, associações, livrarias, construtoras (mesmo que apareçam no mesmo pregão)
- Analise os OBJETOS das licitações em que ambos participaram — isso revela se disputam o MESMO tipo de serviço
- Considere CNAEs secundários e a natureza real dos serviços prestados

TIPOS DE RELACIONAMENTO:
- "concorrente_direto": Disputa exatamente o mesmo tipo de serviço/produto (score 80-100)
- "concorrente_indireto": Oferece serviços substitutos ou complementares que podem competir (score 50-79)
- "potencial_parceiro": Serviços complementares, poderia ser subcontratado ou consórcio (score 30-49)
- "irrelevante": Não há relação de competição real (score 0-29)

REGRAS:
- Se ambas empresas são do mesmo setor (TI com TI, engenharia com engenharia) = score 70+
- Se competem nos mesmos objetos de licitação = score +20
- Se CNAEs são de setores completamente diferentes = score máximo 30
- Uma seguradora que aparece no mesmo pregão de TI NÃO é concorrente = score 5
- Associações de municípios, órgãos públicos, entidades sem fins lucrativos = score 0-10

Para cada concorrente no lote, retorne um objeto JSON com:
{ "cnpj": string, "relevance_score": number (0-100), "relationship_type": string, "reason": string }

Retorne APENAS um array JSON válido (sem markdown).`

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
}

export interface RelevanceResult {
  cnpj: string
  relevance_score: number
  relationship_type: 'concorrente_direto' | 'concorrente_indireto' | 'potencial_parceiro' | 'irrelevante'
  reason: string
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
    const objectsSample = objects.slice(0, 5).map((o) => o.slice(0, 200))
    return `- CNPJ: ${c.cnpj}
  Razão Social: ${c.razao_social || 'Desconhecido'}
  CNAE: ${c.cnae_codigo || 'N/A'} — ${c.cnae_nome || 'N/A'}
  Porte: ${c.porte || 'N/A'} | UF: ${c.uf || 'N/A'}
  Objetos de licitações em comum (amostra): ${objectsSample.length > 0 ? objectsSample.join(' | ') : 'Sem dados'}`
  })

  return `${companySection}

CONCORRENTES PARA AVALIAR (lote de ${competitors.length}):
${competitorEntries.join('\n')}

Analise cada concorrente e retorne um array JSON com a avaliação de relevância de cada um.
Formato: [{ "cnpj": "...", "relevance_score": 0-100, "relationship_type": "concorrente_direto|concorrente_indireto|potencial_parceiro|irrelevante", "reason": "..." }]`
}

/**
 * Analyze relevance of a batch of competitors to a company.
 * Processes up to 5 competitors per LLM call to save tokens.
 */
export async function analyzeCompetitorRelevanceBatch(params: {
  companyProfile: CompanyProfile
  competitors: CompetitorProfile[]
  sharedTenderObjectsMap: Record<string, string[]>
}): Promise<RelevanceResult[]> {
  const { companyProfile, competitors, sharedTenderObjectsMap } = params

  if (competitors.length === 0) return []

  const BATCH_SIZE = 5
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

      if (!response || response.trim().length === 0) {
        logger.warn(
          { batchStart: i, batchSize: batch.length },
          'Empty AI response for competitor relevance, skipping batch',
        )
        // Default to irrelevante for skipped competitors
        for (const c of batch) {
          allResults.push({
            cnpj: c.cnpj,
            relevance_score: 0,
            relationship_type: 'irrelevante',
            reason: 'Análise indisponível (resposta vazia da IA)',
          })
        }
        continue
      }

      let parsed: RelevanceResult[]
      try {
        const raw = parseJsonResponse<RelevanceResult[] | { results: RelevanceResult[] }>(response)
        parsed = Array.isArray(raw) ? raw : (raw as { results: RelevanceResult[] }).results || []
      } catch (parseErr) {
        logger.warn(
          { responseSnippet: response.slice(0, 300), error: parseErr },
          'Failed to parse relevance response, skipping batch',
        )
        for (const c of batch) {
          allResults.push({
            cnpj: c.cnpj,
            relevance_score: 0,
            relationship_type: 'irrelevante',
            reason: 'Análise indisponível (erro de parsing)',
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
          : score >= 80 ? 'concorrente_direto'
            : score >= 50 ? 'concorrente_indireto'
              : score >= 30 ? 'potencial_parceiro'
                : 'irrelevante'

        allResults.push({
          cnpj: result.cnpj,
          relevance_score: score,
          relationship_type: type as RelevanceResult['relationship_type'],
          reason: result.reason?.slice(0, 500) || 'Sem justificativa',
        })
      }

      // For any competitors in the batch that the LLM missed, add defaults
      const processedCnpjs = new Set(parsed.map((r) => r.cnpj))
      for (const c of batch) {
        if (!processedCnpjs.has(c.cnpj)) {
          allResults.push({
            cnpj: c.cnpj,
            relevance_score: 0,
            relationship_type: 'irrelevante',
            reason: 'Não avaliado pela IA neste lote',
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
        'Error in competitor relevance batch, defaulting to irrelevante',
      )
      for (const c of batch) {
        allResults.push({
          cnpj: c.cnpj,
          relevance_score: 0,
          relationship_type: 'irrelevante',
          reason: 'Análise indisponível (erro de processamento)',
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
