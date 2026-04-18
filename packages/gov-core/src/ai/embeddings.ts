import { GoogleGenerativeAI } from '@google/generative-ai'

let _client: GoogleGenerativeAI | null = null
function client(): GoogleGenerativeAI {
  if (_client) return _client
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY não configurada')
  _client = new GoogleGenerativeAI(key)
  return _client
}

/** Gemini text-embedding-004 = 768 dims, otimizado pra retrieval em PT-BR. */
export const EMBEDDING_MODEL = 'text-embedding-004'
export const EMBEDDING_DIM = 768

/**
 * Gera embedding de um texto. Usa task_type="retrieval_document" pra indexação
 * e "retrieval_query" pra busca — isso melhora a qualidade do ranking.
 */
export async function embed(
  text: string,
  taskType: 'retrieval_document' | 'retrieval_query' = 'retrieval_query',
  title?: string,
): Promise<number[]> {
  const model = client().getGenerativeModel({ model: EMBEDDING_MODEL })
  const req: Parameters<typeof model.embedContent>[0] = {
    content: { role: 'user', parts: [{ text }] },
    taskType,
  } as never
  if (taskType === 'retrieval_document' && title) {
    (req as { title?: string }).title = title
  }
  const res = await model.embedContent(req)
  return res.embedding.values
}

/** Batch: Gemini suporta batchEmbedContents até 100 por request. */
export async function embedBatch(
  texts: string[],
  taskType: 'retrieval_document' | 'retrieval_query' = 'retrieval_document',
  titles?: string[],
): Promise<number[][]> {
  if (texts.length === 0) return []
  const model = client().getGenerativeModel({ model: EMBEDDING_MODEL })
  const requests = texts.map((text, i) => ({
    content: { role: 'user', parts: [{ text }] },
    taskType,
    title: taskType === 'retrieval_document' && titles ? titles[i] : undefined,
  }))
  const res = await model.batchEmbedContents({ requests } as never)
  return res.embeddings.map((e) => e.values)
}
