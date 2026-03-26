/**
 * LLM Client unificado — DeepSeek V3 como primary
 *
 * Stack:
 *   Primary:  DeepSeek V3 (deepseek-chat) — $0.14/$0.28 per MTok
 *   Fallback: Together.ai (deepseek-ai/DeepSeek-V3) — $0.30/$0.30 per MTok
 *   Fallback2: Groq (llama-3.3-70b-versatile) — free tier
 *
 * Todos usam formato OpenAI-compatible. Mesma SDK.
 */

import OpenAI from 'openai'
import { logger } from '../lib/logger'

// ─── Clients ─────────────────────────────────────────────────────────────────

const deepseekClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseURL: 'https://api.deepseek.com',
})

const togetherClient = new OpenAI({
  apiKey: process.env.TOGETHER_API_KEY || '',
  baseURL: 'https://api.together.xyz/v1',
})

const groqClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || '',
  baseURL: 'https://api.groq.com/openai/v1',
})

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
  classification:    { maxTokens: 256,  temperature: 0.0 },
  riskAnalysis:      { maxTokens: 2048, temperature: 0.2 },
  onDemandAnalysis:  { maxTokens: 8192, temperature: 0.1 },
  chat:              { maxTokens: 4096, temperature: 0.4 },
  relevanceAnalysis: { maxTokens: 1024, temperature: 0.1 },
}

// ─── Providers (in priority order) ───────────────────────────────────────────

const PROVIDERS = [
  { client: deepseekClient,  model: 'deepseek-chat',                label: 'DeepSeek-V3' },
  { client: togetherClient,  model: 'deepseek-ai/DeepSeek-V3',     label: 'Together/DeepSeek-V3' },
  { client: groqClient,      model: 'qwen/qwen3-32b',                label: 'Groq/Qwen3-32B' },
]

// ─── Throttle (respect rate limits) ──────────────────────────────────────────

let lastCallTime = 0
const MIN_INTERVAL_MS = 500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

  // Throttle
  const now = Date.now()
  const elapsed = now - lastCallTime
  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed)
  }
  lastCallTime = Date.now()

  // Try each provider in order
  for (let providerIdx = 0; providerIdx < PROVIDERS.length; providerIdx++) {
    const provider = PROVIDERS[providerIdx]

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        logger.info(
          { task, provider: provider.label, attempt, promptLen: prompt.length },
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

        // DeepSeek and Together support response_format for JSON
        if (jsonMode) {
          requestBody.response_format = { type: 'json_object' }
        }

        const response = await provider.client.chat.completions.create(requestBody)
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
}

// ─── Streaming (for frontend chat) ───────────────────────────────────────────

export async function streamLLM(params: {
  task: TaskType
  system: string
  prompt: string
}): Promise<AsyncIterable<OpenAI.ChatCompletionChunk>> {
  const config = TASK_CONFIG[params.task]

  // Try DeepSeek first, fallback to Together
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
