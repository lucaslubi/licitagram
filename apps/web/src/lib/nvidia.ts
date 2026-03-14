// NVIDIA API wrapper for web app (chat + on-demand analysis)
// Uses moonshotai/kimi-k2.5 with 128k context window

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const API_KEY = process.env.NVIDIA_API_KEY || ''
const DEFAULT_MODEL = 'moonshotai/kimi-k2.5'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function callNvidiaAI(params: {
  system: string
  prompt: string
  maxTokens?: number
  maxRetries?: number
}): Promise<string> {
  const maxRetries = params.maxRetries ?? 2
  const maxTokens = params.maxTokens ?? 16384

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(NVIDIA_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: maxTokens,
          temperature: 0.3,
          top_p: 1.0,
          messages: [
            { role: 'system', content: params.system },
            { role: 'user', content: params.prompt },
          ],
        }),
        signal: AbortSignal.timeout(120_000),
      })

      if (!response.ok) {
        const status = response.status
        if ((status === 429 || status >= 500) && attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 3000
          console.warn(`NVIDIA API ${status}, retrying in ${delayMs / 1000}s (attempt ${attempt + 1})`)
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

      if (text.length === 0 && attempt < maxRetries) {
        await sleep(3000)
        continue
      }

      return text
    } catch (error: unknown) {
      const isTimeout =
        (error as Error).name === 'TimeoutError' || (error as Error).name === 'AbortError'
      if (isTimeout && attempt < maxRetries) {
        continue
      }
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 3000
        await sleep(delayMs)
        continue
      }
      throw error
    }
  }
  throw new Error('NVIDIA API max retries exceeded')
}

export async function streamNvidiaAI(params: {
  system: string
  prompt: string
  maxTokens?: number
}): Promise<Response> {
  const maxTokens = params.maxTokens ?? 16384

  const response = await fetch(NVIDIA_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: maxTokens,
      temperature: 0.3,
      top_p: 1.0,
      stream: true,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.prompt },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  })

  return response
}

export function parseJsonResponse<T>(text: string): T {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
  const jsonStr = jsonMatch ? jsonMatch[1] : text
  const cleaned = jsonStr.replace(/^[^{[]*/, '').replace(/[^}\]]*$/, '')
  return JSON.parse(cleaned)
}
