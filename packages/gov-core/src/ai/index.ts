import { streamGemini } from './gemini'
import { streamMessage as streamClaude, CLAUDE_MODELS } from './claude'
import { streamOpenAICompat, GROQ, CEREBRAS, OPENROUTER } from './openai-compat'

export { CLAUDE_MODELS, getClaude, streamMessage } from './claude'
export type { ClaudeModel, StreamOptions } from './claude'
export { streamGemini } from './gemini'
export { embed, embedBatch, EMBEDDING_MODEL, EMBEDDING_DIM } from './embeddings'
export { retrieveContext, formatContext, knowledgeStats } from './rag'
export type { KnowledgeChunk } from './rag'

/**
 * Modelos canônicos — identificadores internos (não providers).
 * O provider chain real é escolhido em runtime em `streamText` conforme as
 * env vars disponíveis (GROQ → CEREBRAS → OPENROUTER → GEMINI).
 */
export const AI_MODELS = {
  /** Raciocínio profundo: consolidação PCA, ETP, parecer, matriz de riscos. */
  reasoning: 'llama-3.3-70b',
  /** Rápido/barato: classificação, normalização, extração, sugestões. */
  fast: 'llama-3.3-70b',
} as const
export type AIModel = typeof AI_MODELS[keyof typeof AI_MODELS]

export interface StreamTextOptions {
  model: string
  system?: string
  userMessage: string
  maxTokens?: number
  temperature?: number
}

/**
 * Mapeia o model ID interno (llama-3.3-70b, gemini-2.5-flash, etc.) pro
 * identificador de cada provider. Retorna lista em ordem de prioridade.
 */
interface ProviderAttempt {
  name: 'groq' | 'cerebras' | 'openrouter' | 'gemini' | 'claude'
  model: string
}

function resolveProviders(model: string): ProviderAttempt[] {
  const m = model.toLowerCase()
  const attempts: ProviderAttempt[] = []

  // Llama/Qwen via providers OpenAI-compatible
  if (m.startsWith('llama') || m.startsWith('qwen') || m.startsWith('deepseek') || m.startsWith('mixtral')) {
    if (process.env.GROQ_API_KEY) attempts.push({ name: 'groq', model: GROQ.models.reasoning })
    if (process.env.CEREBRAS_API_KEY) attempts.push({ name: 'cerebras', model: CEREBRAS.models.reasoning })
    if (process.env.OPENROUTER_API_KEY) attempts.push({ name: 'openrouter', model: OPENROUTER.models.reasoning })
    // Fallback final: Gemini Flash (sempre disponível se GEMINI_API_KEY setada)
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) {
      attempts.push({ name: 'gemini', model: 'gemini-2.5-flash' })
    }
    return attempts
  }

  // Gemini direto
  if (m.startsWith('gemini')) {
    attempts.push({ name: 'gemini', model })
    return attempts
  }

  // Claude direto
  if (m.startsWith('claude')) {
    attempts.push({ name: 'claude', model })
    return attempts
  }

  throw new Error(`Model ID não reconhecido: "${model}"`)
}

async function* tryProvider(
  p: ProviderAttempt,
  opts: StreamTextOptions,
): AsyncGenerator<string> {
  if (p.name === 'groq') {
    yield* streamOpenAICompat({
      baseUrl: GROQ.baseUrl,
      apiKey: process.env.GROQ_API_KEY!,
      model: p.model,
      system: opts.system,
      userMessage: opts.userMessage,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    })
    return
  }
  if (p.name === 'cerebras') {
    yield* streamOpenAICompat({
      baseUrl: CEREBRAS.baseUrl,
      apiKey: process.env.CEREBRAS_API_KEY!,
      model: p.model,
      system: opts.system,
      userMessage: opts.userMessage,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    })
    return
  }
  if (p.name === 'openrouter') {
    yield* streamOpenAICompat({
      baseUrl: OPENROUTER.baseUrl,
      apiKey: process.env.OPENROUTER_API_KEY!,
      model: p.model,
      system: opts.system,
      userMessage: opts.userMessage,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      extraHeaders: OPENROUTER.extraHeaders,
    })
    return
  }
  if (p.name === 'gemini') {
    yield* streamGemini({ ...opts, model: p.model })
    return
  }
  if (p.name === 'claude') {
    const stream = streamClaude({
      model: p.model as typeof CLAUDE_MODELS[keyof typeof CLAUDE_MODELS],
      system: opts.system,
      messages: [{ role: 'user', content: opts.userMessage }],
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    })
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text
      }
    }
    return
  }
}

/**
 * Iterator unificado com fallback automático entre providers gratuitos.
 * Tenta Groq → Cerebras → OpenRouter → Gemini. Se o primeiro falhar com
 * 429/5xx/timeout, cai pro próximo. Custo = R$ 0 (tudo free tier).
 */
export async function* streamText(opts: StreamTextOptions): AsyncGenerator<string> {
  const providers = resolveProviders(opts.model)
  if (providers.length === 0) {
    throw new Error(
      'Nenhum provider configurado. Setar uma de: GROQ_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY.',
    )
  }

  const errors: string[] = []
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i]!
    try {
      yield* tryProvider(p, opts)
      return
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`[${p.name}] ${msg.slice(0, 200)}`)
      const isLast = i === providers.length - 1
      if (isLast) throw new Error(`Todos providers falharam:\n${errors.join('\n')}`)
      // Só faz fallback em erros transitórios; erro de prompt/conteúdo sobe direto
      const isTransient = /429|5\d\d|timeout|quota|fetch failed|ECONN|network/i.test(msg)
      if (!isTransient) throw e
      // Senão, continua pro próximo provider
    }
  }
}

/** Lista providers configurados no ambiente (pra debug/healthcheck). */
export function activeProviders(): string[] {
  const out: string[] = []
  if (process.env.GROQ_API_KEY) out.push('groq')
  if (process.env.CEREBRAS_API_KEY) out.push('cerebras')
  if (process.env.OPENROUTER_API_KEY) out.push('openrouter')
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) out.push('gemini')
  if (process.env.ANTHROPIC_API_KEY) out.push('claude')
  return out
}
