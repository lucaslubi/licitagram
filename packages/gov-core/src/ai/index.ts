import { streamGemini } from './gemini'
import { streamMessage as streamClaude, CLAUDE_MODELS } from './claude'
import { streamOpenAICompat, TRUNCATION_MARKER, GROQ, CEREBRAS, OPENROUTER } from './openai-compat'

export { CLAUDE_MODELS, getClaude, streamMessage } from './claude'
export type { ClaudeModel, StreamOptions } from './claude'
export { streamGemini } from './gemini'
export { TRUNCATION_MARKER } from './openai-compat'
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
  //
  // Ordem escolhida pensando em doc longo (ETP/TR/edital ≈ 15-25k tokens):
  //   1. Gemini 2.5 Flash — 65K output tokens, corta menos, rate limit tranquilo
  //   2. Cerebras — velocidade absurda (1000+ tok/s), mas cap 8K saída
  //   3. Groq — cap 8K saída + free tier 30 rpm (derruba fácil)
  //   4. OpenRouter — fallback de última linha (latência alta)
  if (m.startsWith('llama') || m.startsWith('qwen') || m.startsWith('deepseek') || m.startsWith('mixtral')) {
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) {
      attempts.push({ name: 'gemini', model: 'gemini-2.5-flash' })
    }
    if (process.env.CEREBRAS_API_KEY) attempts.push({ name: 'cerebras', model: CEREBRAS.models.reasoning })
    if (process.env.GROQ_API_KEY) attempts.push({ name: 'groq', model: GROQ.models.reasoning })
    if (process.env.OPENROUTER_API_KEY) attempts.push({ name: 'openrouter', model: OPENROUTER.models.reasoning })
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

/** Detecta erros transitórios por HTTP code + keywords. Mais robusto. */
function isTransientError(msg: string): boolean {
  // HTTP codes no prefix (openai-compat joga "HTTP 429..." / "HTTP 503...")
  if (/HTTP (408|409|425|429|5\d\d)\b/.test(msg)) return true
  // Keywords do SDK Gemini/Claude
  return /timeout|deadline|quota|resource[_ ]?exhausted|rate[_ ]?limit|overloaded|fetch failed|ECONN|network|unavailable/i.test(
    msg,
  )
}

/**
 * Iterator unificado com fallback automático entre providers gratuitos.
 * Tenta Gemini → Cerebras → Groq → OpenRouter (ordem revisada — Gemini 2.5
 * Flash tem 65K output, evita cortar ETP/TR longos). Se o primeiro falhar
 * com 429/5xx/timeout, cai pro próximo.
 *
 * Também reage a truncamento (`TRUNCATION_MARKER`): logra um warning no
 * stream e tenta continuação com o próximo provider se houver. Pra
 * consumidor do stream, o marker é removido antes de fluir.
 *
 * Custo = R$ 0 (tudo free tier).
 */
export async function* streamText(opts: StreamTextOptions): AsyncGenerator<string> {
  const providers = resolveProviders(opts.model)
  if (providers.length === 0) {
    throw new Error(
      'Nenhum provider configurado. Setar uma de: GEMINI_API_KEY, CEREBRAS_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY.',
    )
  }

  const errors: string[] = []
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i]!
    let truncated = false
    try {
      for await (const chunk of tryProvider(p, opts)) {
        if (chunk === TRUNCATION_MARKER) {
          truncated = true
          continue
        }
        yield chunk
      }
      // Sucesso não-truncado → fim.
      if (!truncated) return
      // Truncado: não é erro fatal, foi só cap de output. Devolve o que tem.
      // O UI avisa o usuário via error-message. Não retenta porque a
      // continuação iria duplicar conteúdo do meio.
      throw new Error(
        `Provider [${p.name}] truncou por limite de saída (finish_reason=length). Use Gemini 2.5 Flash pra documentos longos.`,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`[${p.name}] ${msg.slice(0, 200)}`)
      const isLast = i === providers.length - 1
      if (isLast) {
        // Se só tivemos truncation (conteúdo OK mas cortado), sobe msg clara.
        if (truncated && errors.every((x) => x.includes('truncou'))) {
          throw new Error(
            'Documento excedeu o limite de tokens da IA (tente reduzir o objeto ou configurar GEMINI_API_KEY).',
          )
        }
        throw new Error(`Todos providers falharam:\n${errors.join('\n')}`)
      }
      // Só faz fallback em erros transitórios OU truncation; erro de
      // prompt/conteúdo (400 bad request, safety block) sobe direto.
      const canRetry = isTransientError(msg) || truncated
      if (!canRetry) throw e
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
