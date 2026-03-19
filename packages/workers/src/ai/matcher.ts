import { matchResultSchema, type MatchResultInput, CNAE_GROUPS } from '@licitagram/shared'
import { callLLM, parseJsonResponse } from './llm-client'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

const SYSTEM_PROMPT = `Voce e um consultor especialista em licitacoes publicas brasileiras. Sua UNICA funcao e avaliar se o OBJETO da licitacao e COMPATIVEL com os CNAEs e atividades da empresa.

PRINCIPIO FUNDAMENTAL: E MUITO MELHOR mostrar uma oportunidade que talvez nao seja perfeita do que PERDER uma boa oportunidade. Na duvida, INCLUA. O usuario pode descartar, mas nao pode encontrar o que voce escondeu.

ANALISE INTELIGENTE DE CNAEs:
- Cada CNAE cobre um UNIVERSO de atividades relacionadas. Interprete de forma AMPLA.
- CNAE 6202/6203/6204 (TI): software, sistemas, suporte, consultoria TI, outsourcing, cloud, dados, automacao, seguranca digital, treinamento TI, help desk, infraestrutura, redes, telecom, licencas
- CNAE 7020 (consultoria): assessoria, planejamento, gestao, auditoria, projetos, treinamento, capacitacao, estudos, diagnosticos, mapeamento
- CNAEs de comercio (46xx, 47xx): fornecimento de TODOS os produtos daquele ramo, inclusive acessorios, pecas, consumiveis relacionados
- CNAEs de servicos (80xx, 81xx, 82xx): terceirizacao, limpeza, seguranca, manutencao, apoio administrativo, facilities
- CNAEs de construcao (41xx, 42xx, 43xx): obras, reformas, instalacoes, manutencao predial, servicos de engenharia
- Se a empresa tem MULTIPLOS CNAEs, considere COMBINACOES de servicos que ela pode oferecer

REGRAS DE PONTUACAO (SEJA GENEROSO):
- Score 0-25: TOTALMENTE incompativel, ramos COMPLETAMENTE diferentes (ex: empresa de alimentos vs obra de ponte)
- Score 26-45: ramos diferentes mas com alguma intersecao possivel
- Score 46-65: ha conexao razoavel, empresa PODERIA fornecer o produto/servico com adaptacao
- Score 66-80: boa compatibilidade, atividade dentro do escopo dos CNAEs
- Score 81-100: compatibilidade direta e clara

REGRAS CRITICAS:
- NAO penalize por falta de informacao. Se um campo esta vazio, assuma NEUTRO (score 70 na categoria)
- NAO penalize por localizacao — licitacoes publicas permitem participacao nacional
- NAO penalize por porte da empresa — micro, pequenas e medias tem ate vantagens em licitacoes
- A pergunta principal e: "O CNAE e atividades da empresa PERMITEM que ela forneca o que a licitacao pede?" Se SIM = score 65+
- Se ha QUALQUER CNAE (principal ou secundario) que cubra o objeto = score 70+

Sempre responda com JSON valido, sem texto adicional.`

function cleanCompanyProfile(company: Record<string, unknown>): Record<string, unknown> {
  const relevant: Record<string, unknown> = {}
  const fields = [
    'razao_social', 'nome_fantasia', 'cnae_principal', 'cnaes_secundarios',
    'porte', 'descricao_servicos', 'capacidades', 'certificacoes',
    'palavras_chave', 'uf', 'municipio',
  ]
  for (const field of fields) {
    let val = company[field]
    if (val !== null && val !== undefined && val !== '' && !(Array.isArray(val) && val.length === 0)) {
      // Truncate very long text fields to keep prompt manageable
      if (typeof val === 'string' && val.length > 2000) {
        val = val.slice(0, 2000) + '...'
      }
      relevant[field] = val
    }
  }

  // Add CNAE descriptions for context
  const allCnaes: string[] = []
  if (company.cnae_principal) allCnaes.push(String(company.cnae_principal))
  if (Array.isArray(company.cnaes_secundarios)) allCnaes.push(...(company.cnaes_secundarios as string[]))

  const cnaeDescriptions: string[] = []
  for (const cnae of allCnaes) {
    const group = cnae.substring(0, 2)
    if (CNAE_GROUPS[group]) {
      cnaeDescriptions.push(`${cnae}: ${CNAE_GROUPS[group]}`)
    }
  }
  if (cnaeDescriptions.length > 0) {
    relevant.atividades_descritas = cnaeDescriptions
  }

  return relevant
}

function buildPrompt(company: Record<string, unknown>, tender: Record<string, unknown>): string {
  const profile = cleanCompanyProfile(company)

  return `Avalie se esta empresa pode participar desta licitacao. LEMBRE: na duvida, INCLUA a oportunidade.

PERFIL DA EMPRESA:
${JSON.stringify(profile, null, 2)}

LICITACAO:
Objeto: ${tender.objeto}
${tender.modalidade_nome ? `Modalidade: ${tender.modalidade_nome}` : ''}
${tender.valor_estimado ? `Valor Estimado: ${tender.valor_estimado}` : ''}
${tender.resumo ? `Resumo: ${String(tender.resumo).slice(0, 2000)}` : ''}
${tender.requisitos ? `Requisitos: ${JSON.stringify(tender.requisitos, null, 2).slice(0, 2000)}` : ''}

ANALISE PRINCIPAL: O objeto da licitacao e algo que a empresa pode fornecer com base nos seus CNAEs e atividades? Considere interpretacao AMPLA dos CNAEs e servicos correlatos.

Retorne APENAS JSON valido (sem markdown):
{
  "score": 0-100,
  "breakdown": [
    { "category": "compatibilidade_objeto", "score": 0-100, "reason": "O objeto da licitacao e compativel com os CNAEs/atividades da empresa?" },
    { "category": "potencial_participacao", "score": 0-100, "reason": "A empresa tem potencial real de fornecer o que e pedido?" },
    { "category": "relevancia_estrategica", "score": 0-100, "reason": "Esta oportunidade e estrategicamente relevante para o perfil da empresa?" }
  ],
  "justificativa": "justificativa em 2-3 frases sobre por que a empresa deve ou nao considerar esta licitacao",
  "recomendacao": "participar|avaliar_melhor|nao_recomendado",
  "riscos": ["riscos identificados, se houver"],
  "acoes_necessarias": ["acoes que a empresa precisa tomar para participar"]
}`
}

export async function matchCompanyToTender(
  companyId: string,
  tenderId: string,
): Promise<MatchResultInput | null> {
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single()

  const { data: tender } = await supabase
    .from('tenders')
    .select('*')
    .eq('id', tenderId)
    .single()

  if (!company || !tender) {
    logger.error({ companyId, tenderId }, 'Company or tender not found')
    return null
  }

  if (!tender.requisitos && tender.objeto.length < 50) {
    logger.warn({ tenderId }, 'No requirements extracted, using objeto only')
  }

  try {
    const response = await callLLM({
      task: 'matching',
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(company, tender),
    })

    if (!response || response.trim().length === 0) {
      logger.warn({ companyId, tenderId }, 'Empty AI response for matching, skipping')
      return null
    }

    let parsed: Record<string, unknown>
    try {
      parsed = parseJsonResponse<Record<string, unknown>>(response)
    } catch (parseErr) {
      logger.warn({ companyId, tenderId, responseSnippet: response.slice(0, 200) }, 'JSON parse failed, attempting manual extraction')
      // Try to extract score from response text as last resort
      const scoreMatch = response.match(/"score"\s*:\s*(\d+)/)
      const justMatch = response.match(/"justificativa"\s*:\s*"([^"]+)"/)
      if (scoreMatch) {
        parsed = {
          score: parseInt(scoreMatch[1], 10),
          breakdown: [],
          justificativa: justMatch?.[1] || 'Avaliação automática',
          recomendacao: 'avaliar_melhor',
          riscos: [],
          acoes_necessarias: [],
        }
      } else {
        throw parseErr
      }
    }
    const validated = matchResultSchema.parse(parsed)

    const { error } = await supabase.from('matches').upsert(
      {
        company_id: companyId,
        tender_id: tenderId,
        score: validated.score,
        breakdown: validated.breakdown,
        ai_justificativa: validated.justificativa,
        riscos: validated.riscos || [],
        acoes_necessarias: validated.acoes_necessarias || [],
        recomendacao: validated.recomendacao || null,
        status: 'new',
      },
      { onConflict: 'company_id,tender_id' },
    )

    if (error) throw error

    logger.info({ companyId, tenderId, score: validated.score }, 'Match computed')
    return validated
  } catch (error) {
    const status = (error as { status?: number }).status
    const code = (error as { code?: string }).code
    if (status === 429 || status === 503) {
      logger.warn({ companyId, tenderId, status }, 'Rate limited during matching, will retry later')
      throw error // Let BullMQ retry
    }
    // Supabase/PostgREST errors (e.g., column mismatch) should also be retried
    if (code === 'PGRST' || code?.startsWith?.('42') || code?.startsWith?.('23')) {
      logger.error({ companyId, tenderId, error, code }, 'Database error during match upsert, retrying')
      throw error // Let BullMQ retry
    }
    // JSON parse errors and Zod validation failures are non-recoverable
    if (error instanceof SyntaxError || (error as { name?: string }).name === 'ZodError') {
      logger.error({ companyId, tenderId, error }, 'Non-recoverable match parsing error, skipping')
      return null
    }
    // Default: rethrow to let BullMQ retry (safer than swallowing)
    logger.error({ companyId, tenderId, error }, 'Failed to compute match, retrying')
    throw error
  }
}
