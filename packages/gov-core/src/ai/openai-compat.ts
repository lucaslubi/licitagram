/**
 * Cliente OpenAI-compatible genérico usado pra Groq, Cerebras, OpenRouter,
 * Together, etc. Todos expõem /v1/chat/completions idêntico à OpenAI.
 *
 * Detecta truncamento por `finish_reason: length` e emite um marker
 * sentinela `__TRUNCATED__` pro consumidor decidir (fallback pro próximo
 * provider ou warning no UI).
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

/** Marker sentinela emitido quando o provider encerra com finish_reason=length. */
export const TRUNCATION_MARKER = '\u0000__TRUNCATED__\u0000'

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
    // Anexa status HTTP na mensagem pra o fallback detectar transient errors
    // sem depender de substring fragile no corpo.
    throw new Error(`HTTP ${res.status} ${opts.baseUrl}: ${body.slice(0, 300)}`)
  }
  if (!res.body) throw new Error('Sem stream')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finishReason: string | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') {
        if (finishReason === 'length') yield TRUNCATION_MARKER
        return
      }
      if (!payload) continue
      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>
        }
        const choice = parsed.choices?.[0]
        const delta = choice?.delta?.content
        if (delta) yield delta
        if (choice?.finish_reason) finishReason = choice.finish_reason
      } catch {
        /* ignore linhas parciais */
      }
    }
  }
  if (finishReason === 'length') yield TRUNCATION_MARKER
}

// ─── Provider presets ────────────────────────────────────────────────────

export const GROQ = {
  baseUrl: 'https://api.groq.com/openai/v1',
  envKey: 'GROQ_API_KEY',
  /** Llama 3.3 70B Versatile: 32k context / 8k saída no free tier. */
  models: {
    reasoning: 'llama-3.3-70b-versatile',
    fast: 'llama-3.1-8b-instant',
  },
} as const

export const CEREBRAS = {
  baseUrl: 'https://api.cerebras.ai/v1',
  envKey: 'CEREBRAS_API_KEY',
  /** llama-3.3-70b: 128k context / 8k saída. */
  models: {
    reasoning: 'llama-3.3-70b',
    fast: 'llama3.1-8b',
  },
} as const

export const OPENROUTER = {
  baseUrl: 'https://openrouter.ai/api/v1',
  envKey: 'OPENROUTER_API_KEY',
  /**
   * Reasoning: Gemini 2.5 Flash via OpenRouter (65K output, 1M context).
   * É o modelo ideal pra artefatos longos (ETP, TR, Edital, Parecer).
   * Free tier mas limit alto via OpenRouter credits.
   * Fallback pro llama :free se o gemini falhar por rate.
   */
  models: {
    reasoning: 'google/gemini-2.5-flash-preview-05-20',
    reasoningFallback: 'meta-llama/llama-3.3-70b-instruct:free',
    fast: 'meta-llama/llama-3.3-70b-instruct:free',
  },
  extraHeaders: {
    'HTTP-Referer': 'https://gov.licitagram.com',
    'X-Title': 'LicitaGram Gov',
  },
} as const

/**
 * DeepSeek — modelo open-source top com context 64K e output 8K estável.
 * Mais parrudo que llama-3.3-70b em raciocínio jurídico. Baratíssimo
 * (pago mas $0.14/MTok input, $0.28/MTok output).
 */
export const DEEPSEEK = {
  baseUrl: 'https://api.deepseek.com/v1',
  envKey: 'DEEPSEEK_API_KEY',
  models: {
    reasoning: 'deepseek-chat', // V3 general
    fast: 'deepseek-chat',
  },
} as const
