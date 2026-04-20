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
    // 429: respeita Retry-After. Se < 15s, aguarda no próprio provider em
    // vez de pular pro próximo (rate limits curtos se resolvem sozinhos).
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after') ?? res.headers.get('x-ratelimit-reset-requests')
      const waitSec = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null
      if (waitSec !== null && waitSec > 0 && waitSec <= 15) {
        await new Promise((r) => setTimeout(r, waitSec * 1000 + 500))
        // Retry uma vez após o wait
        const retry = await fetch(`${opts.baseUrl}/chat/completions`, {
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
        if (retry.ok && retry.body) {
          // Continua com o stream retry em vez do falhado
          yield* streamFromResponse(retry)
          return
        }
      }
      throw new Error(
        `HTTP 429 ${opts.baseUrl}: rate limit${waitSec ? ` (retry em ${waitSec}s)` : ''}. ${body.slice(0, 200)}`,
      )
    }
    throw new Error(`HTTP ${res.status} ${opts.baseUrl}: ${body.slice(0, 300)}`)
  }
  if (!res.body) throw new Error('Sem stream')
  yield* streamFromResponse(res)
}

/** Parseia SSE e emite text chunks + TRUNCATION_MARKER no fim se aplicável. */
async function* streamFromResponse(res: Response): AsyncGenerator<string> {
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

/**
 * Gemini via endpoint OpenAI-compatible do Google.
 *
 * Usar este endpoint em vez do SDK oficial @google/generative-ai resolve
 * diferenças sutis de auth (o SDK oficial as vezes rejeita a mesma chave
 * que o endpoint OpenAI-compat aceita). Padrão já adotado no B2B
 * (apps/web/src/lib/ai-client.ts), agora unificado no Gov.
 *
 * Docs: https://ai.google.dev/gemini-api/docs/openai
 */
export const GEMINI_COMPAT = {
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  envKey: 'GEMINI_API_KEY',
  models: {
    reasoning: 'gemini-2.5-flash',
    fast: 'gemini-2.5-flash',
  },
} as const

export const OPENROUTER = {
  baseUrl: 'https://openrouter.ai/api/v1',
  envKey: 'OPENROUTER_API_KEY',
  /**
   * Cascade de modelos :free atuais do OpenRouter (verificado 2026-04-20
   * via GET /api/v1/models). Todos com rate limit independente por
   * provedor upstream — diversificação máxima pra resiliência.
   *
   *   reasoning             — gpt-oss-120b :free (GRÁTIS, 131K out, OpenAI open)
   *   reasoningFreeHuge     — nemotron-3-super-120b :free (GRÁTIS, 262K out)
   *   reasoningFreeGLM      — glm-4.5-air :free (GRÁTIS, 96K out, Z.AI)
   *   reasoningFreeGemma    — gemma-4-31b :free (GRÁTIS, 32K out, Google)
   *   reasoningFreeLong     — qwen3-coder :free (GRÁTIS, 262K out, raciocínio PT)
   *   reasoningFallback     — llama-3.3-70b :free (último recurso)
   *   fast                  — idem reasoningFallback
   */
  models: {
    reasoning: 'openai/gpt-oss-120b:free',
    reasoningFreeHuge: 'nvidia/nemotron-3-super-120b-a12b:free',
    reasoningFreeGLM: 'z-ai/glm-4.5-air:free',
    reasoningFreeGemma: 'google/gemma-4-31b-it:free',
    reasoningFreeLong: 'qwen/qwen3-coder:free',
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
 * Pago ($0.14/$0.28 MTok). Opt-in via DEEPSEEK_ENABLED=true.
 */
export const DEEPSEEK = {
  baseUrl: 'https://api.deepseek.com/v1',
  envKey: 'DEEPSEEK_API_KEY',
  models: {
    reasoning: 'deepseek-chat',
    fast: 'deepseek-chat',
  },
} as const

/**
 * Mistral AI La Plateforme — free tier generoso (1B tokens/mês).
 * Mistral Small 3.1 (24B) open-weights, 128K ctx, excelente PT.
 * Endpoint OpenAI-compat em api.mistral.ai/v1.
 *
 * Obter chave: https://console.mistral.ai/api-keys
 */
export const MISTRAL = {
  baseUrl: 'https://api.mistral.ai/v1',
  envKey: 'MISTRAL_API_KEY',
  models: {
    reasoning: 'mistral-small-latest', // 24B, 128K ctx, free tier
    fast: 'mistral-small-latest',
  },
} as const
