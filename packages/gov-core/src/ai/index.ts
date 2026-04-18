import { streamGemini } from './gemini'
import { streamMessage as streamClaude, CLAUDE_MODELS } from './claude'

export { CLAUDE_MODELS, getClaude, streamMessage } from './claude'
export type { ClaudeModel, StreamOptions } from './claude'
export { streamGemini } from './gemini'

/**
 * Modelos canônicos usados pelo LicitaGram Gov. Troca de provider é uma
 * mudança de string aqui — as rotas consomem `streamText(model, ...)`
 * e o switch é feito pelo prefixo.
 *
 * Default: Gemini 2.5 Pro (reasoning) + 2.5 Flash (rápido). Claude fica
 * disponível como alternativa via CLAUDE_MODELS se precisar comparar
 * qualidade ou custo.
 */
export const AI_MODELS = {
  /** Raciocínio profundo: consolidação PCA, ETP, parecer, matriz de riscos. */
  reasoning: 'gemini-2.5-pro',
  /** Rápido/barato: classificação, normalização, extração, sugestões. */
  fast: 'gemini-2.5-flash',
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
 * Iterator unificado de chunks de texto. Escolhe o provider pelo prefixo
 * do model ID:
 *   - `gemini-*` → Google Generative AI
 *   - `claude-*` → Anthropic SDK
 *
 * Erros (API key ausente, quota, etc.) são propagados pra cima — o caller
 * decide como reportar ao usuário.
 */
export async function* streamText(opts: StreamTextOptions): AsyncGenerator<string> {
  const model = opts.model.toLowerCase()

  if (model.startsWith('gemini')) {
    yield* streamGemini(opts)
    return
  }

  if (model.startsWith('claude')) {
    const stream = streamClaude({
      model: opts.model as typeof CLAUDE_MODELS[keyof typeof CLAUDE_MODELS],
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

  throw new Error(`Provider não suportado para modelo "${opts.model}"`)
}
