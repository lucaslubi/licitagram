/**
 * LLM Client unificado — OpenAI-compatible
 *
 * Providers:
 *   - Together.ai (Qwen 2.5-72B) → extração, classificação, riscos
 *   - DeepSeek (V3.2)            → matching, sumarização
 *   - Groq (Llama 3.3-70B)      → fallback universal
 *
 * Todos usam o formato OpenAI. Mesma SDK, mesma interface.
 * Trocar provider = mudar baseURL + model. Zero mudança nos prompts.
 */

import OpenAI from 'openai'
import { logger } from '../lib/logger'

// ─── Clients ─────────────────────────────────────────────────────────────────

const togetherClient = new OpenAI({
  apiKey: process.env.TOGETHER_API_KEY || '',
  baseURL: 'https://api.together.xyz/v1',
})

const deepseekClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseURL: 'https://api.deepseek.com',
})

const groqClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || '',
  baseURL: 'https://api.groq.com/openai/v1',
})

// ─── Model Configuration ─────────────────────────────────────────────────────

const MODELS = {
  extraction: {
    client: togetherClient,
    model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
    maxTokens: 4096,
    temperature: 0.1,
    label: 'Together/Qwen72B',
  },
  matching: {
    client: deepseekClient,
    model: 'deepseek-chat',
    maxTokens: 2048,
    temperature: 0.1,
    label: 'DeepSeek/V3.2',
  },
  summary: {
    client: deepseekClient,
    model: 'deepseek-chat',
    maxTokens: 512,
    temperature: 0.3,
    label: 'DeepSeek/V3.2',
  },
  classification: {
    client: togetherClient,
    model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
    maxTokens: 256,
    temperature: 0.0,
    label: 'Together/Qwen72B',
  },
  riskAnalysis: {
    client: togetherClient,
    model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
    maxTokens: 2048,
    temperature: 0.2,
    label: 'Together/Qwen72B',
  },
  // Frontend on-demand analysis (used by /api/analyze)
  onDemandAnalysis: {
    client: togetherClient,
    model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
    maxTokens: 4096,
    temperature: 0.1,
    label: 'Together/Qwen72B',
  },
  // Frontend chat (used by /api/chat)
  chat: {
    client: deepseekClient,
    model: 'deepseek-chat',
    maxTokens: 4096,
    temperature: 0.4,
    label: 'DeepSeek/V3.2',
  },
} as const

type TaskType = keyof typeof MODELS

// ─── Fallback Client ─────────────────────────────────────────────────────────

const FALLBACK = {
  client: groqClient,
  model: 'llama-3.3-70b-versatile',
  label: 'Groq/Llama3.3-70B',
}

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
  const config = MODELS[task]

  // Throttle
  const now = Date.now()
  const elapsed = now - lastCallTime
  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed)
  }
  lastCallTime = Date.now()

  // Try primary provider
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      logger.info(
        { task, model: config.label, attempt, promptLen: prompt.length },
        'Calling LLM',
      )

      const requestBody: OpenAI.ChatCompletionCreateParamsNonStreaming = {
        model: config.model,
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

      const response = await config.client.chat.completions.create(requestBody)
      const text = response.choices[0]?.message?.content || ''

      if (text.length === 0 && attempt < maxRetries) {
        logger.warn({ task, attempt }, 'Empty response, retrying...')
        await sleep(2000)
        continue
      }

      logger.info(
        { task, model: config.label, outputLen: text.length },
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
          { task, model: config.label, status, attempt, delay },
          `LLM error, retrying in ${delay / 1000}s`,
        )
        await sleep(delay)
        continue
      }

      // Last attempt failed on primary → try fallback
      if (attempt === maxRetries) {
        logger.warn(
          { task, model: config.label, error: (error as Error).message },
          'Primary LLM exhausted, trying fallback (Groq)',
        )
        break
      }

      throw error
    }
  }

  // ─── Fallback: Groq (Llama 3.3-70B) ─────────────────────────────────────

  try {
    logger.info({ task, model: FALLBACK.label }, 'Calling fallback LLM')

    const response = await FALLBACK.client.chat.completions.create({
      model: FALLBACK.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    })

    const text = response.choices[0]?.message?.content || ''
    logger.info({ task, model: FALLBACK.label, outputLen: text.length }, 'Fallback response received')
    return text
  } catch (fallbackError) {
    logger.error({ task, error: (fallbackError as Error).message }, 'Fallback LLM also failed')
    throw fallbackError
  }
}

// ─── Streaming (for frontend chat) ───────────────────────────────────────────

export async function streamLLM(params: {
  task: TaskType
  system: string
  prompt: string
}): Promise<AsyncIterable<OpenAI.ChatCompletionChunk>> {
  const config = MODELS[params.task]

  const stream = await config.client.chat.completions.create({
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    stream: true,
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: params.prompt },
    ],
  })

  return stream
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
