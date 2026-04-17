import Anthropic from '@anthropic-ai/sdk'

export const CLAUDE_MODELS = {
  opus: 'claude-opus-4-7',
  haiku: 'claude-haiku-4-5-20251001',
} as const

export type ClaudeModel = typeof CLAUDE_MODELS[keyof typeof CLAUDE_MODELS]

let client: Anthropic | null = null

export function getClaude(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set — cannot initialize Claude client')
    }
    client = new Anthropic({ apiKey })
  }
  return client
}

export interface StreamOptions {
  model: ClaudeModel
  system?: string
  messages: Anthropic.MessageParam[]
  maxTokens?: number
  temperature?: number
}

/**
 * Thin wrapper around the SDK's streaming API. Consumers iterate over the
 * returned stream to get incremental text deltas. Throws if the API key is
 * missing or the SDK rejects the request.
 */
export function streamMessage(opts: StreamOptions) {
  return getClaude().messages.stream({
    model: opts.model,
    system: opts.system,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.2,
  })
}
