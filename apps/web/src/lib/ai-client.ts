import OpenAI from 'openai'

/**
 * Shared AI client factory.
 *
 * Priority:
 *  1. Google AI Studio (FREE — 500 req/day, generous TPM)
 *  2. OpenRouter (paid)
 *  3. Groq (free tier, 100K TPD)
 *
 * Google's Gemini API exposes an OpenAI-compatible endpoint,
 * so we can reuse the same OpenAI SDK everywhere.
 */

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || ''
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ''
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''

// Google AI Studio — FREE tier (gemini-2.5-flash)
const googleAI = GOOGLE_AI_API_KEY
  ? new OpenAI({
      apiKey: GOOGLE_AI_API_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    })
  : null

// OpenRouter — paid (Gemini, Claude, GPT, etc.)
const openrouterAI = OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://licitagram.com',
        'X-Title': 'Licitagram',
      },
    })
  : null

// Groq — free tier (Llama 3.3 70B, 100K TPD)
const groqAI = GROQ_API_KEY
  ? new OpenAI({
      apiKey: GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    })
  : null

export interface AIProvider {
  client: OpenAI
  model: string
  name: string
}

/**
 * Returns the best available AI provider.
 * Google AI (free) > OpenRouter (paid) > Groq (free, limited)
 */
export function getAIProvider(): AIProvider {
  if (googleAI) {
    return { client: googleAI, model: 'gemini-2.5-flash', name: 'Google AI' }
  }
  if (openrouterAI) {
    return { client: openrouterAI, model: 'google/gemini-2.5-flash', name: 'OpenRouter' }
  }
  if (groqAI) {
    return { client: groqAI, model: 'llama-3.3-70b-versatile', name: 'Groq' }
  }
  throw new Error('No AI provider configured. Set GOOGLE_AI_API_KEY, OPENROUTER_API_KEY, or GROQ_API_KEY.')
}

/**
 * Calls AI with automatic fallback across providers.
 * Tries Google → OpenRouter → Groq in order.
 */
export async function callAIWithFallback(
  params: Omit<OpenAI.ChatCompletionCreateParamsNonStreaming, 'model'> & { model?: string },
): Promise<OpenAI.ChatCompletion> {
  const providers: AIProvider[] = []

  if (googleAI) providers.push({ client: googleAI, model: 'gemini-2.5-flash', name: 'Google AI' })
  if (openrouterAI) providers.push({ client: openrouterAI, model: 'google/gemini-2.5-flash', name: 'OpenRouter' })
  if (groqAI) providers.push({ client: groqAI, model: 'llama-3.3-70b-versatile', name: 'Groq' })

  if (providers.length === 0) {
    throw new Error('No AI provider configured.')
  }

  let lastError: Error | null = null

  for (const provider of providers) {
    try {
      const result = await provider.client.chat.completions.create({
        ...params,
        model: provider.model,
      })
      return result
    } catch (err: any) {
      const status = err?.status || err?.response?.status
      console.warn(`[ai-client] ${provider.name} failed (${status}): ${err?.message?.slice(0, 100)}`)
      lastError = err
      // Continue to next provider
    }
  }

  throw lastError || new Error('All AI providers failed')
}

/**
 * Streaming version with automatic fallback.
 */
export async function streamAIWithFallback(
  params: Omit<OpenAI.ChatCompletionCreateParamsStreaming, 'model' | 'stream'> & { model?: string },
): Promise<{ stream: AsyncIterable<OpenAI.ChatCompletionChunk>; provider: string }> {
  const providers: AIProvider[] = []

  if (googleAI) providers.push({ client: googleAI, model: 'gemini-2.5-flash', name: 'Google AI' })
  if (openrouterAI) providers.push({ client: openrouterAI, model: 'google/gemini-2.5-flash', name: 'OpenRouter' })
  if (groqAI) providers.push({ client: groqAI, model: 'llama-3.3-70b-versatile', name: 'Groq' })

  if (providers.length === 0) {
    throw new Error('No AI provider configured.')
  }

  let lastError: Error | null = null

  for (const provider of providers) {
    try {
      const stream = await provider.client.chat.completions.create({
        ...params,
        model: provider.model,
        stream: true,
      })
      return { stream, provider: provider.name }
    } catch (err: any) {
      const status = err?.status || err?.response?.status
      console.warn(`[ai-client] ${provider.name} stream failed (${status}): ${err?.message?.slice(0, 100)}`)
      lastError = err
    }
  }

  throw lastError || new Error('All AI providers failed')
}
