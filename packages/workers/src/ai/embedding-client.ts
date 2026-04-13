/**
 * Embedding Client — 100% FREE strategy
 *
 * Priority order:
 *   1. Voyage AI (voyage-3)     — 200M free tokens, 1024 dims, excellent PT-BR
 *   2. Jina AI v5               — 10M free tokens, 1024 dims
 *   3. Ollama/BGE-M3 (local)    — fallback if OLLAMA_URL is set
 *   4. OpenAI (text-embedding-3-small) — paid fallback if configured
 *
 * ENV: VOYAGE_API_KEY, JINA_API_KEY, OLLAMA_URL, OPENAI_API_KEY
 */

import { logger } from '../lib/logger'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'
const JINA_API_URL = 'https://api.jina.ai/v1/embeddings'
const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings'

const EMBEDDING_DIM = 1024
const MAX_BATCH_SIZE = 8  // Small batches to stay within free-tier token limits
const OLLAMA_BATCH_SIZE = 16 // smaller batches for local model to avoid OOM

// Rate limiter: respects provider RPM limits (free tier = 3 RPM for Voyage)
const RATE_LIMIT_WINDOW_MS = 60_000
const MAX_REQUESTS_PER_MINUTE = parseInt(process.env.EMBEDDING_RPM || '3', 10)
const requestTimestamps: number[] = []

async function waitForRateLimit(): Promise<void> {
  const now = Date.now()
  // Remove timestamps older than 1 minute
  while (requestTimestamps.length > 0 && requestTimestamps[0]! < now - RATE_LIMIT_WINDOW_MS) {
    requestTimestamps.shift()
  }
  if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    const waitMs = requestTimestamps[0]! + RATE_LIMIT_WINDOW_MS - now + 100
    logger.debug({ waitMs, queueSize: requestTimestamps.length }, 'Rate limiting embeddings, waiting...')
    await sleep(waitMs)
    return waitForRateLimit() // Re-check after waiting
  }
  requestTimestamps.push(now)
}

interface EmbeddingResult {
  embedding: number[]
  index: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Ollama/BGE-M3 (LOCAL — unlimited, zero cost) ────────────────────────────

async function embedWithOllama(texts: string[]): Promise<number[][]> {
  const allEmbeddings: number[][] = []

  // Process in smaller batches to avoid OOM on the VPS
  for (let i = 0; i < texts.length; i += OLLAMA_BATCH_SIZE) {
    const batch = texts.slice(i, i + OLLAMA_BATCH_SIZE)

    const response = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'bge-m3',
        input: batch,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Ollama API error ${response.status}: ${body.slice(0, 300)}`)
    }

    const data = await response.json() as { embeddings: number[][] }
    if (!data.embeddings || data.embeddings.length !== batch.length) {
      throw new Error(`Ollama returned ${data.embeddings?.length ?? 0} embeddings, expected ${batch.length}`)
    }

    // Validate dimension
    for (const emb of data.embeddings) {
      if (emb.length !== EMBEDDING_DIM) {
        throw new Error(`Ollama BGE-M3 returned ${emb.length} dims, expected ${EMBEDDING_DIM}`)
      }
    }

    allEmbeddings.push(...data.embeddings)
  }

  return allEmbeddings
}

// ─── Voyage AI (FREE — 200M tokens) ──────────────────────────────────────────

async function embedWithVoyage(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) throw new Error('VOYAGE_API_KEY not set')

  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'voyage-3',
      input: texts,
      output_dimension: EMBEDDING_DIM,
      input_type: 'document',
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Voyage API error ${response.status}: ${body.slice(0, 300)}`)
  }

  const data = await response.json() as { data: EmbeddingResult[] }
  const sorted = data.data.sort((a, b) => a.index - b.index)
  return sorted.map((d) => d.embedding)
}

// ─── Jina AI (FREE — 10M tokens, may be exhausted) ──────────────────────────

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
      model: 'jina-embeddings-v5-text-small',
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
  const sorted = data.data.sort((a, b) => a.index - b.index)
  return sorted.map((d) => d.embedding)
}

// ─── OpenAI (paid fallback) ──────────────────────────────────────────────────

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

// ─── Provider chain ──────────────────────────────────────────────────────────

interface EmbeddingProvider {
  name: string
  envKey: string | null // null = always available (local)
  fn: (texts: string[]) => Promise<number[][]>
}

const EMBEDDING_PROVIDERS: EmbeddingProvider[] = [
  { name: 'Voyage AI',     envKey: 'VOYAGE_API_KEY',  fn: embedWithVoyage },
  { name: 'Jina AI',       envKey: 'JINA_API_KEY',    fn: embedWithJina },
  { name: 'Ollama/BGE-M3', envKey: 'OLLAMA_URL',      fn: embedWithOllama },  // fallback only
  { name: 'OpenAI',        envKey: 'OPENAI_API_KEY',  fn: embedWithOpenAI },
]

/**
 * Generate embeddings with cascading fallback.
 * Tries Voyage AI (free) → Jina (free) → Ollama/BGE-M3 (local) → OpenAI (paid) in order.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const allEmbeddings: number[][] = []

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE)
    const batchIdx = Math.floor(i / MAX_BATCH_SIZE)
    let batchDone = false

    // Try each provider in order
    for (const provider of EMBEDDING_PROVIDERS) {
      // Skip cloud providers without API key; Ollama (envKey=null) is always available
      if (provider.envKey !== null && !process.env[provider.envKey]) continue

      try {
        // Respect rate limits for cloud providers
        if (provider.envKey !== null && provider.envKey !== 'OLLAMA_URL') {
          await waitForRateLimit()
        }
        const embeddings = await provider.fn(batch)
        allEmbeddings.push(...embeddings)
        logger.debug(
          { provider: provider.name, batchSize: batch.length, batchIdx },
          'Embeddings generated',
        )
        batchDone = true
        break
      } catch (err) {
        logger.warn(
          { err: (err as Error).message, provider: provider.name, batchIdx },
          `${provider.name} embedding failed, trying next provider`,
        )
        continue
      }
    }

    if (!batchDone) {
      const configured = EMBEDDING_PROVIDERS
        .filter(p => p.envKey === null || !!process.env[p.envKey!])
        .map(p => p.name)
      throw new Error(
        `All embedding providers failed for batch ${batchIdx}. ` +
        `Configured: [${configured.join(', ')}]. ` +
        `Set VOYAGE_API_KEY for free embeddings, or configure OLLAMA_URL for local inference`,
      )
    }
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
