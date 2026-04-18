import { GoogleGenerativeAI, type Content } from '@google/generative-ai'

let client: GoogleGenerativeAI | null = null

function getClient(): GoogleGenerativeAI {
  if (client) return client
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY (ou GOOGLE_AI_API_KEY) não configurada')
  }
  client = new GoogleGenerativeAI(apiKey)
  return client
}

export interface GeminiStreamOptions {
  model: string
  system?: string
  userMessage: string
  maxTokens?: number
  temperature?: number
}

/**
 * Yields Gemini text chunks as they arrive.
 * Interface deliberadamente parecida com a do Claude pra permitir hot-swap
 * entre providers via o `streamText` unificado em `./index.ts`.
 */
export async function* streamGemini(opts: GeminiStreamOptions): AsyncGenerator<string> {
  const c = getClient()
  const model = c.getGenerativeModel({
    model: opts.model,
    ...(opts.system ? { systemInstruction: opts.system } : {}),
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      maxOutputTokens: opts.maxTokens ?? 4096,
    },
  })

  const contents: Content[] = [{ role: 'user', parts: [{ text: opts.userMessage }] }]
  const result = await model.generateContentStream({ contents })
  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) yield text
  }
}
