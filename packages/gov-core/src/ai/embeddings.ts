import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * Provider chain de embeddings:
 *  1. Self-hosted Text Embeddings Inference (TEI) com multilingual-e5-large
 *     — 1024 dims, sem rate limit, zero custo, dados 100% BR.
 *     Ativado quando EMBEDDINGS_URL está setado.
 *  2. Gemini gemini-embedding-001 (free tier) — fallback.
 *
 * Ambos produzem vetores 1024 dims compatíveis com a VECTOR(1024) da
 * knowledge_base do gov. O Gemini aplica matryoshka truncation.
 */

export const EMBEDDING_DIM = 1024
type TaskType = 'retrieval_document' | 'retrieval_query'

// ─── Provider 1: TEI self-host (prioritário) ─────────────────────────────
async function embedTEI(text: string, taskType: TaskType): Promise<number[]> {
  const url = process.env.EMBEDDINGS_URL
  const apiKey = process.env.EMBEDDINGS_API_KEY
  if (!url) throw new Error('EMBEDDINGS_URL não configurada')
  // E5 espera prefixo "query: " ou "passage: " pra melhor qualidade
  const prefix = taskType === 'retrieval_query' ? 'query: ' : 'passage: '
  const res = await fetch(`${url}/embed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ inputs: prefix + text, normalize: true, truncate: true }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`TEI ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as number[][]
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('TEI: resposta inesperada')
  }
  return data[0]!
}

// ─── Provider 2: Gemini (fallback) ───────────────────────────────────────
let _gemini: GoogleGenerativeAI | null = null
function geminiClient(): GoogleGenerativeAI {
  if (_gemini) return _gemini
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY não configurada')
  _gemini = new GoogleGenerativeAI(key)
  return _gemini
}
async function embedGemini(text: string, taskType: TaskType, title?: string): Promise<number[]> {
  const model = geminiClient().getGenerativeModel({ model: 'gemini-embedding-001' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req: any = {
    content: { role: 'user', parts: [{ text }] },
    taskType,
    outputDimensionality: EMBEDDING_DIM,
  }
  if (taskType === 'retrieval_document' && title) req.title = title
  const res = await model.embedContent(req)
  return res.embedding.values
}

// ─── API pública ─────────────────────────────────────────────────────────
export async function embed(
  text: string,
  taskType: TaskType = 'retrieval_query',
  title?: string,
): Promise<number[]> {
  // Tenta TEI primeiro; cai pro Gemini se falhar ou se não estiver configurado.
  if (process.env.EMBEDDINGS_URL) {
    try {
      return await embedTEI(text, taskType)
    } catch (e) {
      if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_AI_API_KEY) throw e
      console.warn('[embed] TEI falhou, fallback Gemini:', e instanceof Error ? e.message : String(e))
    }
  }
  return embedGemini(text, taskType, title)
}

/**
 * Batch sequencial com delay. TEI aguenta concorrência mas mantemos delay
 * leve pra não saturar o VPS. Gemini free tier tem quota apertada.
 */
export async function embedBatch(
  texts: string[],
  taskType: TaskType = 'retrieval_document',
  titles?: string[],
  delayMs = 50, // TEI é rápido; 50ms é só pra não atropelar
): Promise<number[][]> {
  const out: number[][] = []
  for (let i = 0; i < texts.length; i++) {
    out.push(await embed(texts[i]!, taskType, titles?.[i]))
    if (i < texts.length - 1) await new Promise((r) => setTimeout(r, delayMs))
  }
  return out
}

export const EMBEDDING_MODEL = 'multilingual-e5-large'
