/**
 * Cliente OpenAI-compatible genérico usado pra Groq, Cerebras, OpenRouter,
 * Together, etc. Todos expõem /v1/chat/completions idêntico à OpenAI.
 */

export interface OpenAICompatOptions {
  baseUrl: string
  apiKey: string
  model: string
  system?: string
  userMessage: string
  maxTokens?: number
  temperature?: number
  extraHeaders?: Record<string, string>
}

export async function* streamOpenAICompat(opts: OpenAICompatOptions): AsyncGenerator<string> {
  const messages: Array<{ role: string; content: string }> = []
  if (opts.system) messages.push({ role: 'system', content: opts.system })
  messages.push({ role: 'user', content: opts.userMessage })

  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
      ...(opts.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      model: opts.model,
      messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.2,
      stream: true,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${opts.baseUrl}: ${body.slice(0, 300)}`)
  }
  if (!res.body) throw new Error('Sem stream')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') return
      if (!payload) continue
      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch {
        /* ignore linhas parciais */
      }
    }
  }
}

// ─── Provider presets ────────────────────────────────────────────────────

export const GROQ = {
  baseUrl: 'https://api.groq.com/openai/v1',
  envKey: 'GROQ_API_KEY',
  /** Llama 3.3 70B é o melhor modelo gratuito do Groq pra raciocínio. */
  models: {
    reasoning: 'llama-3.3-70b-versatile',
    fast: 'llama-3.1-8b-instant',
  },
} as const

export const CEREBRAS = {
  baseUrl: 'https://api.cerebras.ai/v1',
  envKey: 'CEREBRAS_API_KEY',
  models: {
    reasoning: 'llama-3.3-70b',
    fast: 'llama3.1-8b',
  },
} as const

export const OPENROUTER = {
  baseUrl: 'https://openrouter.ai/api/v1',
  envKey: 'OPENROUTER_API_KEY',
  /** Versões :free do OpenRouter — sem custo de tokens. */
  models: {
    reasoning: 'meta-llama/llama-3.3-70b-instruct:free',
    fast: 'meta-llama/llama-3.3-70b-instruct:free',
  },
  extraHeaders: {
    'HTTP-Referer': 'https://gov.licitagram.com',
    'X-Title': 'LicitaGram Gov',
  },
} as const
