import { callLLM } from './llm-client'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'

const SYSTEM_PROMPT = `Voce e um especialista em licitacoes publicas brasileiras. Gere resumos executivos claros e concisos em portugues.`

export async function summarizeTender(tenderId: string): Promise<string | null> {
  const { data: tender } = await supabase
    .from('tenders')
    .select('id, objeto, orgao_nome, modalidade_nome, valor_estimado, uf')
    .eq('id', tenderId)
    .single()

  if (!tender) return null

  const { data: docs } = await supabase
    .from('tender_documents')
    .select('texto_extraido')
    .eq('tender_id', tenderId)
    .eq('status', 'done')
    .limit(1)

  const docText = docs?.[0]?.texto_extraido?.slice(0, 5000) || ''

  try {
    const response = await callLLM({
      task: 'summary',
      system: SYSTEM_PROMPT,
      prompt: `Gere um resumo executivo em 2-3 frases para este edital:

Orgao: ${tender.orgao_nome}
Objeto: ${tender.objeto}
Modalidade: ${tender.modalidade_nome}
Valor: ${tender.valor_estimado}
UF: ${tender.uf}

Trecho do edital: ${docText}

Resumo:`,
    })

    const summary = response.trim()

    await supabase.from('tenders').update({ resumo: summary }).eq('id', tenderId)

    logger.info({ tenderId }, 'Tender summarized')
    return summary
  } catch (error) {
    logger.error({ tenderId, error }, 'Failed to summarize tender')
    return null
  }
}
