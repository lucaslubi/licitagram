/**
 * LLM Client unificado — 100% FREE via OpenRouter (multi-key) + Groq
 *
 * Stack (all free, cascading fallback):
 *   1. Groq (llama-3.3-70b)       — free tier, fastest
 *   2. OpenRouter/Qwen3.6-Plus    — free, #1 Finance/Academia, 1M context
 *   3. OpenRouter/Nemotron-120B   — free, NVIDIA 120B MoE
 *   4. OpenRouter/Llama-3.3-70B   — free, strong general-purpose
 *   5. OpenRouter/Hermes-405B     — free, largest open model
 *   6. OpenRouter/Gemma-3-27B     — free, good classification
 *   7. OpenRouter/GPT-OSS-120B    — free, OpenAI open-source
 *
 * Multi-key: set OPENROUTER_API_KEY=key1,key2,key3 for round-robin
 * across multiple accounts, multiplying rate limits.
 *
 * Todos usam formato OpenAI-compatible. Mesma SDK.
 */

import OpenAI from 'openai'
import { logger } from '../lib/logger'

// ─── Clients ─────────────────────────────────────────────────────────────────

const groqClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || '',
  baseURL: 'https://api.groq.com/openai/v1',
})

// Multi-key OpenRouter: split comma-separated keys into separate clients
// Each key gets its own rate limit quota → multiplied throughput
const openrouterKeys = (process.env.OPENROUTER_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean)
const openrouterClients = openrouterKeys.map((key) =>
  new OpenAI({
    apiKey: key,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'https://licitagram.com.br',
      'X-Title': 'Licitagram Workers',
    },
  }),
)

// Round-robin counter for distributing calls across keys
let _orKeyIdx = 0
function nextORClient(): OpenAI {
  if (openrouterClients.length === 0) {
    throw new Error('No OPENROUTER_API_KEY configured')
  }
  const client = openrouterClients[_orKeyIdx % openrouterClients.length]
  _orKeyIdx++
  return client
}

logger.info(
  { groqConfigured: !!process.env.GROQ_API_KEY, openrouterKeys: openrouterKeys.length },
  'LLM clients initialized (100% free)',
)

// ─── Task Configuration ─────────────────────────────────────────────────────

type TaskType =
  | 'extraction'
  | 'matching'
  | 'summary'
  | 'classification'
  | 'riskAnalysis'
  | 'onDemandAnalysis'
  | 'chat'
  | 'relevanceAnalysis'

const TASK_CONFIG: Record<TaskType, { maxTokens: number; temperature: number }> = {
  extraction:        { maxTokens: 4096, temperature: 0.1 },
  matching:          { maxTokens: 2048, temperature: 0.1 },
  summary:           { maxTokens: 512,  temperature: 0.3 },
  classification:    { maxTokens: 1024, temperature: 0.0 },
  riskAnalysis:      { maxTokens: 2048, temperature: 0.2 },
  onDemandAnalysis:  { maxTokens: 8192, temperature: 0.1 },
  chat:              { maxTokens: 4096, temperature: 0.4 },
  relevanceAnalysis: { maxTokens: 1024, temperature: 0.1 },
}

// ─── Providers (in priority order, ALL FREE) ────────────────────────────────
// OpenRouter providers use getter to round-robin across API keys on each access

interface Provider {
  readonly client: OpenAI
  readonly model: string
  readonly label: string
}

const PROVIDERS: Provider[] = [
  // Groq — fastest, 100K TPD free
  { client: groqClient, model: 'llama-3.3-70b-versatile', label: 'Groq/Llama-3.3-70B' },
  // OpenRouter free models — round-robin across all configured keys
  { get client() { return nextORClient() }, model: 'qwen/qwen3.6-plus:free',                 label: 'OR/Qwen3.6-Plus' },
  { get client() { return nextORClient() }, model: 'nvidia/nemotron-3-super-120b-a12b:free',  label: 'OR/Nemotron-120B' },
  { get client() { return nextORClient() }, model: 'meta-llama/llama-3.3-70b-instruct:free', label: 'OR/Llama-3.3-70B' },
  { get client() { return nextORClient() }, model: 'nousresearch/hermes-3-llama-3.1-405b:free', label: 'OR/Hermes-405B' },
  { get client() { return nextORClient() }, model: 'google/gemma-3-27b-it:free',             label: 'OR/Gemma-3-27B' },
  { get client() { return nextORClient() }, model: 'openai/gpt-oss-120b:free',               label: 'OR/GPT-OSS-120B' },
]

// ─── Concurrency Limiter (prevent free tier rate limit flooding) ─────────────

const MAX_CONCURRENT = 3 // increased from 2 → multi-key can handle more
let activeCalls = 0
const waitQueue: Array<() => void> = []

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function acquireSlot(): Promise<void> {
  if (activeCalls < MAX_CONCURRENT) {
    activeCalls++
    return
  }
  // Wait for a slot to free up
  return new Promise<void>((resolve) => {
    waitQueue.push(() => {
      activeCalls++
      resolve()
    })
  })
}

function releaseSlot(): void {
  activeCalls--
  const next = waitQueue.shift()
  if (next) next()
}

// ─── Main Function ───────────────────────────────────────────────────────────

export async function callLLM(params: {
  task: TaskType
  system: string
  prompt: string
  maxRetries?: number
  jsonMode?: boolean
}): Promise<string> {
  const { task, system, prompt, maxRetries = 3, jsonMode = false } = params
  const config = TASK_CONFIG[task]

  // Wait for a concurrency slot before making any LLM call
  await acquireSlot()

  try {
    // Try each provider in order
    for (let providerIdx = 0; providerIdx < PROVIDERS.length; providerIdx++) {
      const provider = PROVIDERS[providerIdx]

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // Access provider.client each attempt → round-robins OR keys on retries
          const client = provider.client

          logger.info(
            { task, provider: provider.label, attempt, promptLen: prompt.length, orKeys: openrouterKeys.length },
            'Calling LLM',
          )

          const requestBody: OpenAI.ChatCompletionCreateParamsNonStreaming = {
            model: provider.model,
            max_tokens: config.maxTokens,
            temperature: config.temperature,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: prompt },
            ],
          }

          if (jsonMode) {
            requestBody.response_format = { type: 'json_object' }
          }

          const response = await client.chat.completions.create(requestBody)
          const text = response.choices[0]?.message?.content || ''

          if (text.length === 0 && attempt < maxRetries) {
            logger.warn({ task, provider: provider.label, attempt }, 'Empty response, retrying...')
            await sleep(2000)
            continue
          }

          logger.info(
            { task, provider: provider.label, outputLen: text.length },
            'LLM response received',
          )
          return text
        } catch (error: unknown) {
          const status = (error as { status?: number }).status
          const isRateLimit = status === 429
          const isServerError = status && status >= 500

          if ((isRateLimit || isServerError) && attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * (isRateLimit ? 5000 : 3000)
            logger.warn(
              { task, provider: provider.label, status, attempt, delay },
              `LLM error, retrying in ${delay / 1000}s`,
            )
            await sleep(delay)
            continue
          }

          // Exhausted retries on this provider → try next provider
          if (attempt === maxRetries) {
            logger.warn(
              { task, provider: provider.label, error: (error as Error).message },
              `Provider exhausted, trying next fallback`,
            )
            break // exit retry loop, go to next provider
          }
        }
      }
    }

    // All providers failed
    throw new Error(`All LLM providers failed for task: ${task}`)
  } finally {
    releaseSlot()
  }
}

// ─── Streaming (for frontend chat) ───────────────────────────────────────────

export async function streamLLM(params: {
  task: TaskType
  system: string
  prompt: string
}): Promise<AsyncIterable<OpenAI.ChatCompletionChunk>> {
  const config = TASK_CONFIG[params.task]

  // Try Groq first, then OR/Qwen3.6-Plus
  for (const provider of PROVIDERS.slice(0, 2)) {
    try {
      const stream = await provider.client.chat.completions.create({
        model: provider.model,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        stream: true,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.prompt },
        ],
      })
      return stream as AsyncIterable<OpenAI.ChatCompletionChunk>
    } catch (error) {
      logger.warn({ provider: provider.label, error: (error as Error).message }, 'Stream provider failed, trying next')
      continue
    }
  }

  throw new Error('All stream providers failed')
}

// ─── JSON Parser (reusable) ──────────────────────────────────────────────────

export function parseJsonResponse<T>(text: string): T {
  // Strip markdown code fences if present
  const jsonMatch = text.match(/```json?\s*([\s\S]*?)\s*```/)
  const jsonStr = jsonMatch ? jsonMatch[1] : text

  // Remove any non-JSON prefix/suffix
  const cleaned = jsonStr.replace(/^[^{[]*/, '').replace(/[^}\]]*$/, '')
  return JSON.parse(cleaned)
}
