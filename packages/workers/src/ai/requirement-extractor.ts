import { tenderRequirementsSchema, type TenderRequirementsInput } from '@licitagram/shared'
import { callLLM, parseJsonResponse } from './llm-client'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'

const SYSTEM_PROMPT = `Voce e um especialista em licitacoes publicas brasileiras (Lei 14.133/2021 e Lei 8.666/1993). Sua tarefa e analisar editais e extrair requisitos em formato JSON estruturado. Sempre responda com JSON valido, sem texto adicional.`

function buildPrompt(objeto: string, documentText: string): string {
  const truncated = documentText.slice(0, 8_000)

  return `Analise o seguinte edital de licitacao e extraia TODOS os requisitos.

OBJETO: ${objeto}

TEXTO DO EDITAL:
${truncated}

Retorne APENAS um JSON valido com a seguinte estrutura (sem markdown, sem texto antes/depois):
{
  "resumo": "resumo do objeto em 2-3 frases",
  "requisitos": [
    {
      "categoria": "habilitacao_juridica|qualificacao_tecnica|qualificacao_economica|regularidade_fiscal|proposta_tecnica|outro",
      "descricao": "descricao do requisito",
      "obrigatorio": true,
      "detalhes": "detalhes adicionais"
    }
  ],
  "prazo_execucao": "prazo se mencionado ou null",
  "valor_estimado": null,
  "local_execucao": "local se mencionado ou null",
  "cnae_relacionados": ["lista de codigos CNAE relevantes"]
}`
}

export async function extractRequirements(tenderId: string): Promise<TenderRequirementsInput | null> {
  const { data: tender } = await supabase
    .from('tenders')
    .select('id, objeto, valor_estimado')
    .eq('id', tenderId)
    .single()

  if (!tender) {
    logger.error({ tenderId }, 'Tender not found')
    return null
  }

  const { data: docs } = await supabase
    .from('tender_documents')
    .select('texto_extraido')
    .eq('tender_id', tenderId)
    .eq('status', 'done')

  const documentText = (docs || [])
    .map((d: any) => d.texto_extraido)
    .filter(Boolean)
    .join('\n\n')

  if (!documentText && tender.objeto.length < 50) {
    logger.warn({ tenderId }, 'No document text and short objeto, skipping extraction')
    return null
  }

  const textToAnalyze = documentText || tender.objeto

  try {
    const response = await callLLM({
      task: 'extraction',
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(tender.objeto, textToAnalyze),
    })

    if (!response || response.trim().length === 0) {
      logger.warn({ tenderId }, 'Empty AI response, skipping')
      return null
    }

    const parsed = parseJsonResponse<TenderRequirementsInput>(response)
    const validated = tenderRequirementsSchema.parse(parsed)

    await supabase
      .from('tenders')
      .update({
        requisitos: validated,
        resumo: validated.resumo,
        status: 'analyzed',
      })
      .eq('id', tenderId)

    logger.info({ tenderId, reqCount: validated.requisitos.length }, 'Requirements extracted')
    return validated
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 429 || status === 503) {
      logger.warn({ tenderId, status }, 'Rate limited during extraction, will retry later')
      // Don't set status to error — keep as 'new' so it retries
      throw error // Let BullMQ retry
    }
    logger.error({ tenderId, error }, 'Failed to extract requirements')
    await supabase.from('tenders').update({ status: 'error' }).eq('id', tenderId)
    return null
  }
}
