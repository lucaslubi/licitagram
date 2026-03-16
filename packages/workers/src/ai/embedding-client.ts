/**
 * Embedding Client — Jina AI v3 (primary) + OpenAI fallback
 *
 * Jina v3: $0.02/1M tokens, 1024 dimensions, excellent PT-BR support
 * OpenAI: text-embedding-3-small as fallback ($0.02/1M tokens, 1536 dims → truncated to 1024)
 *
 * ENV: JINA_API_KEY (primary), OPENAI_API_KEY (fallback)
 */

import { logger } from '../lib/logger'

const JINA_API_URL = 'https://api.jina.ai/v1/embeddings'
const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings'

const EMBEDDING_DIM = 1024
const MAX_BATCH_SIZE = 64 // Jina supports up to 2048, but 64 is safer for memory

interface EmbeddingResult {
  embedding: number[]
  index: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Generate embeddings via Jina AI v3
 */
async function embedWithJina(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.JINA_API_KEY
  if (!apiKey) throw new Error('JINA_API_KEY not set')

  const response = await fetch(JINA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'jina-embeddings-v3',
      input: texts,
      dimensions: EMBEDDING_DIM,
      task: 'text-matching',
      late_chunking: false,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Jina API error ${response.status}: ${body.slice(0, 300)}`)
  }

  const data = await response.json() as { data: EmbeddingResult[] }
  // Sort by index to maintain input order
  const sorted = data.data.sort((a, b) => a.index - b.index)
  return sorted.map((d) => d.embedding)
}

/**
 * Generate embeddings via OpenAI (fallback)
 */
async function embedWithOpenAI(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: texts,
      dimensions: EMBEDDING_DIM,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI embedding error ${response.status}: ${body.slice(0, 300)}`)
  }

  const data = await response.json() as { data: EmbeddingResult[] }
  const sorted = data.data.sort((a, b) => a.index - b.index)
  return sorted.map((d) => d.embedding)
}

/**
 * Generate embeddings with automatic fallback.
 * Tries Jina v3 first, falls back to OpenAI text-embedding-3-small.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  // Process in batches
  const allEmbeddings: number[][] = []

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE)

    // Try Jina first
    if (process.env.JINA_API_KEY) {
      try {
        const embeddings = await embedWithJina(batch)
        allEmbeddings.push(...embeddings)
        logger.debug({ provider: 'jina', batchSize: batch.length }, 'Embeddings generated')
        if (i + MAX_BATCH_SIZE < texts.length) await sleep(200) // rate limit courtesy
        continue
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Jina embedding failed, trying OpenAI fallback')
      }
    }

    // Fallback to OpenAI
    if (process.env.OPENAI_API_KEY) {
      try {
        const embeddings = await embedWithOpenAI(batch)
        allEmbeddings.push(...embeddings)
        logger.debug({ provider: 'openai', batchSize: batch.length }, 'Embeddings generated (fallback)')
        if (i + MAX_BATCH_SIZE < texts.length) await sleep(200)
        continue
      } catch (err) {
        logger.error({ err: (err as Error).message }, 'OpenAI embedding fallback also failed')
        throw err
      }
    }

    throw new Error('No embedding provider configured. Set JINA_API_KEY or OPENAI_API_KEY.')
  }

  return allEmbeddings
}

/**
 * Generate a single embedding for one text.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const [embedding] = await generateEmbeddings([text])
  return embedding
}

/**
 * Format a vector for Supabase pgvector insertion.
 * pgvector expects the format: [0.1,0.2,0.3,...]
 */
export function formatVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}
