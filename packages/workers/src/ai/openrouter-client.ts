import { logger } from '../lib/logger'

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const API_KEY = process.env.NVIDIA_API_KEY || process.env.OPENROUTER_API_KEY || ''

if (!API_KEY) {
  console.error('[FATAL] Neither NVIDIA_API_KEY nor OPENROUTER_API_KEY is set. AI features will fail.')
}

const DEFAULT_MODEL = 'moonshotai/kimi-k2.5'

// Throttle AI calls to avoid rate limits
let lastCallTime = 0
const MIN_CALL_INTERVAL = 1500 // 1.5 seconds between calls (NVIDIA free tier allows ~20/min)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function callAI(params: {
  model?: string
  system: string
  prompt: string
  maxRetries?: number
  maxTokens?: number
}): Promise<string> {
  const modelName = params.model || DEFAULT_MODEL
  const maxRetries = params.maxRetries ?? 3
  const maxTokens = params.maxTokens ?? 16384

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Throttle to respect rate limits
      const now = Date.now()
      const elapsed = now - lastCallTime
      if (elapsed < MIN_CALL_INTERVAL) {
        await sleep(MIN_CALL_INTERVAL - elapsed)
      }
      lastCallTime = Date.now()

      logger.info(
        { model: modelName, attempt, promptLength: params.prompt.length },
        'Calling NVIDIA API (Kimi K2.5)',
      )

      const response = await fetch(NVIDIA_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: maxTokens,
          temperature: 0.3,
          top_p: 1.0,
          messages: [
            { role: 'system', content: params.system },
            { role: 'user', content: params.prompt },
          ],
        }),
        signal: AbortSignal.timeout(120_000), // 120s timeout for larger model
      })

      if (!response.ok) {
        const status = response.status
        if ((status === 429 || status >= 500) && attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 8000
          logger.warn(
            { model: modelName, attempt, delayMs, status },
            `Rate limit/error, retrying in ${delayMs / 1000}s`,
          )
          await sleep(delayMs)
          continue
        }
        const errorText = await response.text()
        throw new Error(`NVIDIA API error: ${status} ${errorText}`)
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
        error?: { message?: string }
      }

      if (json.error) {
        throw new Error(`NVIDIA API error: ${json.error.message}`)
      }

      const text = json.choices?.[0]?.message?.content || ''

      logger.info(
        { model: modelName, outputLength: text.length },
        'NVIDIA API response received',
      )

      // If empty response and we have retries left, wait and retry
      if (text.length === 0 && attempt < maxRetries) {
        logger.warn({ model: modelName, attempt }, 'Empty response, retrying...')
        await sleep(5000)
        continue
      }

      return text
    } catch (error: unknown) {
      const isTimeout =
        (error as Error).name === 'TimeoutError' || (error as Error).name === 'AbortError'
      if (isTimeout) {
        logger.warn({ model: modelName, attempt }, 'Request timed out after 120s')
        if (attempt < maxRetries) {
          continue
        }
        throw new Error(`NVIDIA API timeout for ${modelName}`)
      }
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 8000
        logger.warn({ model: modelName, attempt, delayMs, error: (error as Error).message }, 'Retrying after error')
        await sleep(delayMs)
        continue
      }
      throw error
    }
  }
  throw new Error(`NVIDIA API max retries exceeded for ${modelName}`)
}

export function parseJsonResponse<T>(text: string): T {
  // Try to extract JSON from markdown code blocks first
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
  const jsonStr = jsonMatch ? jsonMatch[1] : text

  // Clean any surrounding non-JSON characters
  const cleaned = jsonStr.replace(/^[^{[]*/, '').replace(/[^}\]]*$/, '')
  return JSON.parse(cleaned)
}
