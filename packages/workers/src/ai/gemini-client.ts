import { GoogleGenerativeAI } from '@google/generative-ai'
import { logger } from '../lib/logger'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function callGemini(params: {
  model?: 'gemini-2.0-flash' | 'gemini-2.0-flash-lite'
  system: string
  prompt: string
  maxRetries?: number
}): Promise<string> {
  const modelName = params.model || 'gemini-2.0-flash'
  const maxRetries = params.maxRetries ?? 5

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: params.system,
  })

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      logger.info({ model: modelName, attempt, promptLength: params.prompt.length }, 'Calling Gemini')

      const result = await model.generateContent(params.prompt)
      const text = result.response.text()

      logger.info({ model: modelName, outputLength: text.length }, 'Gemini response received')
      return text
    } catch (error: unknown) {
      const status = (error as { status?: number }).status
      if (status === 429 && attempt < maxRetries) {
        // Extract retry delay from error or use exponential backoff
        const retryDelay = (error as { errorDetails?: Array<{ retryDelay?: string }> })
          .errorDetails?.find((d) => d.retryDelay)?.retryDelay
        const delaySeconds = retryDelay ? parseInt(retryDelay) || 10 : Math.pow(2, attempt) * 5
        const delayMs = delaySeconds * 1000

        logger.warn(
          { model: modelName, attempt, delayMs, status },
          `Gemini rate limit hit, retrying in ${delaySeconds}s`,
        )
        await sleep(delayMs)
        continue
      }
      throw error
    }
  }
  throw new Error('Gemini max retries exceeded')
}

export function parseJsonResponse<T>(text: string): T {
  // Try to extract JSON from markdown code blocks first
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
  const jsonStr = jsonMatch ? jsonMatch[1] : text

  // Clean any surrounding non-JSON characters
  const cleaned = jsonStr.replace(/^[^{[]*/, '').replace(/[^}\]]*$/, '')
  return JSON.parse(cleaned)
}
