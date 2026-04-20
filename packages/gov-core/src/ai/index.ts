import { streamGemini } from './gemini'
import { streamMessage as streamClaude, CLAUDE_MODELS } from './claude'
import {
  streamOpenAICompat,
  TRUNCATION_MARKER,
  GROQ,
  CEREBRAS,
  OPENROUTER,
  DEEPSEEK,
  GEMINI_COMPAT,
  MISTRAL,
} from './openai-compat'

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
  name: 'groq' | 'cerebras' | 'openrouter' | 'gemini' | 'gemini_compat' | 'claude' | 'deepseek' | 'mistral'
  model: string
  /** Max de output tokens que o provider suporta — usado pra clamp no tryProvider. */
  outputCap: number
}

function resolveProviders(model: string, requestedMaxTokens?: number): ProviderAttempt[] {
  const m = model.toLowerCase()
  const attempts: ProviderAttempt[] = []

  // Llama/Qwen via providers OpenAI-compatible
  //
  // Ordenação por capacidade de saída — crítico pra docs longos (ETP, TR,
  // Edital, Parecer chegam fácil a 15-25K tokens de output):
  //   1. Gemini 2.5 Flash (direto)            — 65K output, 1M context
  //   2. OpenRouter → gemini-2.5-flash        — 65K output, fallback se direto falhar
  //   3. DeepSeek V3                          — 8K output, mas excelente raciocínio PT
  //   4. Cerebras llama-3.3-70b               — 8K output, 1000+ tok/s
  //   5. Groq llama-3.3-70b                   — 8K output, free 30rpm
  //   6. OpenRouter llama-3.3 free            — 8K output, rede lenta
  //
  // Obs: o parâmetro requestedMaxTokens ficou reservado pra uso futuro
  // (ex.: priorizar só providers 65K quando user pedir explicitamente).
  // Hoje não filtramos — preferimos ter fallback completo pra resiliência
  // em rate-limit.
  void requestedMaxTokens

  if (m.startsWith('llama') || m.startsWith('qwen') || m.startsWith('deepseek') || m.startsWith('mixtral')) {
    // ─── CHAIN 100% FREE TIER ──────────────────────────────────────────
    // Nenhum provider pago. Se algum bater rate limit, próximo :free
    // independente cobre. Qualquer paid só se explicitamente habilitado
    // via env var DEEPSEEK_ENABLED=true / OPENROUTER_PAID_ENABLED=true.

    // Camada 1: Gemini direto (free tier 15 RPM, 1500 RPD)
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) {
      attempts.push({ name: 'gemini_compat', model: GEMINI_COMPAT.models.reasoning, outputCap: 65536 })
    }

    // Camada 2: Mistral La Plateforme — free tier 1B tokens/mês (gigante).
    // Mistral Small 3.1 open-weights, 128K ctx. Excelente em PT-BR.
    if (process.env.MISTRAL_API_KEY) {
      attempts.push({ name: 'mistral', model: MISTRAL.models.reasoning, outputCap: 32768 })
    }

    // Camada 3: OpenRouter :free modernos (cada um com rate limit próprio)
    if (process.env.OPENROUTER_API_KEY) {
      // Gemini 2.5 Pro Exp :free — 65K out
      attempts.push({ name: 'openrouter', model: OPENROUTER.models.reasoningFreeHuge, outputCap: 65536 })
      // GLM 4.6 :free — 200K ctx, raciocínio SOTA, Z.AI
      attempts.push({ name: 'openrouter', model: OPENROUTER.models.reasoningFreeGLM, outputCap: 32768 })
      // NVIDIA Nemotron Super 49B :free — 32K out
      attempts.push({ name: 'openrouter', model: OPENROUTER.models.reasoningFreeLong, outputCap: 32768 })
      // Gemma 3 27B IT :free — Google, 128K ctx, 8K out
      attempts.push({ name: 'openrouter', model: OPENROUTER.models.reasoningFreeGemma, outputCap: 8192 })
    }

    // Camada 3: diretos free tier (8K out)
    if (process.env.CEREBRAS_API_KEY) {
      attempts.push({ name: 'cerebras', model: CEREBRAS.models.reasoning, outputCap: 8192 })
    }
    if (process.env.GROQ_API_KEY) {
      attempts.push({ name: 'groq', model: GROQ.models.reasoning, outputCap: 8192 })
    }

    // Camada 4: último recurso (llama :free via OpenRouter)
    if (process.env.OPENROUTER_API_KEY) {
      attempts.push({ name: 'openrouter', model: OPENROUTER.models.reasoningFallback, outputCap: 8192 })
    }

    // ─── OPT-IN: providers pagos (só se explicitamente habilitados) ────
    // OpenRouter gemini-2.5-flash-preview consumiria crédito — usar só
    // se OPENROUTER_PAID_ENABLED=true na env do Vercel.
    if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_PAID_ENABLED === 'true') {
      attempts.push({ name: 'openrouter', model: OPENROUTER.models.reasoning, outputCap: 65536 })
    }
    if (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_ENABLED === 'true') {
      attempts.push({ name: 'deepseek', model: DEEPSEEK.models.reasoning, outputCap: 8192 })
    }

    return attempts
  }

  // Gemini direto (mantém gemini_compat como default; SDK oficial só se
  // explicitamente solicitado com 'gemini-sdk:' prefix)
  if (m.startsWith('gemini')) {
    if (m.startsWith('gemini-sdk:')) {
      attempts.push({ name: 'gemini', model: model.replace(/^gemini-sdk:/, ''), outputCap: 65536 })
    } else {
      attempts.push({ name: 'gemini_compat', model, outputCap: 65536 })
    }
    return attempts
  }

  // Claude direto
  if (m.startsWith('claude')) {
    attempts.push({ name: 'claude', model, outputCap: 8192 })
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
      maxTokens: Math.min(opts.maxTokens ?? p.outputCap, p.outputCap),
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
      maxTokens: Math.min(opts.maxTokens ?? p.outputCap, p.outputCap),
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
      maxTokens: Math.min(opts.maxTokens ?? p.outputCap, p.outputCap),
      temperature: opts.temperature,
      extraHeaders: OPENROUTER.extraHeaders,
    })
    return
  }
  if (p.name === 'deepseek') {
    yield* streamOpenAICompat({
      baseUrl: DEEPSEEK.baseUrl,
      apiKey: process.env.DEEPSEEK_API_KEY!,
      model: p.model,
      system: opts.system,
      userMessage: opts.userMessage,
      maxTokens: Math.min(opts.maxTokens ?? p.outputCap, p.outputCap),
      temperature: opts.temperature,
    })
    return
  }
  if (p.name === 'mistral') {
    yield* streamOpenAICompat({
      baseUrl: MISTRAL.baseUrl,
      apiKey: process.env.MISTRAL_API_KEY!,
      model: p.model,
      system: opts.system,
      userMessage: opts.userMessage,
      maxTokens: Math.min(opts.maxTokens ?? p.outputCap, p.outputCap),
      temperature: opts.temperature,
    })
    return
  }
  if (p.name === 'gemini') {
    yield* streamGemini({
      ...opts,
      model: p.model,
      maxTokens: Math.min(opts.maxTokens ?? p.outputCap, p.outputCap),
    })
    return
  }
  if (p.name === 'gemini_compat') {
    yield* streamOpenAICompat({
      baseUrl: GEMINI_COMPAT.baseUrl,
      apiKey: (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY)!,
      model: p.model,
      system: opts.system,
      userMessage: opts.userMessage,
      maxTokens: Math.min(opts.maxTokens ?? p.outputCap, p.outputCap),
      temperature: opts.temperature,
    })
    return
  }
  if (p.name === 'claude') {
    const stream = streamClaude({
      model: p.model as typeof CLAUDE_MODELS[keyof typeof CLAUDE_MODELS],
      system: opts.system,
      messages: [{ role: 'user', content: opts.userMessage }],
      maxTokens: Math.min(opts.maxTokens ?? p.outputCap, p.outputCap),
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
 * Detecta erros retryable (transient OU auth específico de uma key).
 *
 * Inclui 401/403: quando um provider rejeita a chave (expirada, quota
 * diária de free tier, modelo não habilitado), é melhor tentar o
 * próximo provider do chain em vez de abortar tudo. Se TODOS falharem,
 * o erro final de "Todos providers falharam" dá contexto completo.
 */
function isTransientError(msg: string): boolean {
  // HTTP codes retryable:
  //   401/403 — auth, pula provider
  //   402     — payment required (DeepSeek/OpenRouter sem saldo)
  //   408     — request timeout
  //   409/425 — conflict/too-early
  //   429     — rate limit
  //   5xx     — server errors
  if (/HTTP (401|402|403|408|409|425|429|5\d\d)\b/.test(msg)) return true
  // Keywords (SDK-level, sem HTTP prefix)
  return /timeout|deadline|quota|resource[_ ]?exhausted|rate[_ ]?limit|overloaded|fetch failed|ECONN|network|unavailable|api[_ ]?key|unauthorized|forbidden|authentication|permission[_ ]?denied|insufficient[_ ]?balance|payment[_ ]?required|billing|credits?\s*exhausted/i.test(
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
  const providers = resolveProviders(opts.model, opts.maxTokens)
  if (providers.length === 0) {
    throw new Error(
      'Nenhum provider configurado. Setar uma de: GEMINI_API_KEY, OPENROUTER_API_KEY, DEEPSEEK_API_KEY, CEREBRAS_API_KEY, GROQ_API_KEY.',
    )
  }

  const errors: string[] = []
  const chainInfo = providers.map((p) => `${p.name}:${p.model}`).join(' → ')
  console.log(`[streamText] chain: ${chainInfo}`)

  for (let i = 0; i < providers.length; i++) {
    const p = providers[i]!
    let truncated = false
    let bytesEmitted = 0
    const attemptStart = Date.now()
    try {
      for await (const chunk of tryProvider(p, opts)) {
        if (chunk === TRUNCATION_MARKER) {
          truncated = true
          continue
        }
        bytesEmitted += chunk.length
        yield chunk
      }
      // Sucesso não-truncado → fim.
      if (!truncated) return

      // Truncado. Decisão: se já emitimos conteúdo substancial (> 6KB —
      // típico de um ETP longo quase completo), NÃO retentamos, pra não
      // duplicar conteúdo do meio quando o fallback reinicia do zero.
      // Apenas emitimos nota de rodapé e encerramos "com sucesso parcial".
      if (bytesEmitted >= 6000) {
        const note = `\n\n---\n\n[NOTA: este documento foi cortado pela IA no limite de saída do provider ${p.name}. Regenere o documento se quiser a versão completa — o sistema agora tentará Gemini 2.5 Flash (65K tokens de saída) primeiro.]\n`
        yield note
        return
      }

      // Conteúdo pouco — vale tentar o próximo provider (falha precoce).
      throw new Error(
        `Provider [${p.name}] truncou com apenas ${bytesEmitted} bytes — tentando próximo provider com output maior.`,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const elapsed = Date.now() - attemptStart
      console.warn(`[streamText] provider ${i + 1}/${providers.length} [${p.name}] falhou em ${elapsed}ms: ${msg.slice(0, 250)}`)
      errors.push(`[${p.name}] ${msg.slice(0, 200)}`)
      const isLast = i === providers.length - 1
      if (isLast) {
        if (truncated) {
          throw new Error(
            `Documento excedeu o limite de tokens em todos providers. Verifique GEMINI_API_KEY ou OPENROUTER_API_KEY (são os únicos com 65K de output).`,
          )
        }
        throw new Error(`Todos providers falharam:\n${errors.join('\n')}`)
      }
      // Só faz fallback em erros transitórios OU truncation precoce;
      // erro de prompt/conteúdo (400 bad request, safety block) sobe direto.
      const canRetry = isTransientError(msg) || truncated
      if (!canRetry) throw e

      // Backoff antes de pular pro próximo provider. Rate limits de
      // janela curta (burst) se resolvem em 1-2s. Evita cascata imediata
      // de 429s quando todos os providers foram chamados em sequência.
      const isRateLimit = /HTTP 429|rate[_ ]?limit|quota|exhausted/i.test(msg)
      if (isRateLimit) {
        const delayMs = 1500 + Math.floor(Math.random() * 1000) // 1.5-2.5s jitter
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
  }
}

/** Lista providers configurados no ambiente (pra debug/healthcheck). */
export function activeProviders(): string[] {
  const out: string[] = []
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) out.push('gemini')
  if (process.env.MISTRAL_API_KEY) out.push('mistral')
  if (process.env.OPENROUTER_API_KEY) out.push('openrouter')
  if (process.env.DEEPSEEK_API_KEY) out.push('deepseek')
  if (process.env.CEREBRAS_API_KEY) out.push('cerebras')
  if (process.env.GROQ_API_KEY) out.push('groq')
  if (process.env.ANTHROPIC_API_KEY) out.push('claude')
  return out
}
