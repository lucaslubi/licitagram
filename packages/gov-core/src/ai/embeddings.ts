import { GoogleGenerativeAI } from '@google/generative-ai'

let _client: GoogleGenerativeAI | null = null
function client(): GoogleGenerativeAI {
  if (_client) return _client
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY não configurada')
  _client = new GoogleGenerativeAI(key)
  return _client
}

/**
 * Gemini embedding-001 com matryoshka truncation pra 768 dims
 * (match com VECTOR(768) da knowledge_base). Default do modelo é 3072 dims.
 * Nota: `batchEmbedContents` NÃO é suportado nesse modelo — usar embedContent
 * em série com rate limit (REST do Gemini aguenta ~150 rpm no free tier).
 */
export const EMBEDDING_MODEL = 'gemini-embedding-001'
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req: any = {
    content: { role: 'user', parts: [{ text }] },
    taskType,
    outputDimensionality: EMBEDDING_DIM,
  }
  if (taskType === 'retrieval_document' && title) {
    req.title = title
  }
  const res = await model.embedContent(req)
  return res.embedding.values
}

/**
 * Pseudo-batch (sequencial com rate limit) — o modelo atual não aceita
 * batchEmbedContents. Retorna array na mesma ordem das inputs.
 */
export async function embedBatch(
  texts: string[],
  taskType: 'retrieval_document' | 'retrieval_query' = 'retrieval_document',
  titles?: string[],
  delayMs = 400,
): Promise<number[][]> {
  const out: number[][] = []
  for (let i = 0; i < texts.length; i++) {
    out.push(await embed(texts[i]!, taskType, titles?.[i]))
    if (i < texts.length - 1) await new Promise((r) => setTimeout(r, delayMs))
  }
  return out
}
