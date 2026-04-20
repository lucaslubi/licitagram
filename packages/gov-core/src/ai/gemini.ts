import { GoogleGenerativeAI, type Content } from '@google/generative-ai'
import { TRUNCATION_MARKER } from './openai-compat'

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
 *
 * Detecta truncamento por `finishReason: MAX_TOKENS` e emite o marker
 * sentinela `TRUNCATION_MARKER` pro consumer reagir (avisa no UI ou
 * tenta continuação).
 */
export async function* streamGemini(opts: GeminiStreamOptions): AsyncGenerator<string> {
  const c = getClient()
  const model = c.getGenerativeModel({
    model: opts.model,
    ...(opts.system ? { systemInstruction: opts.system } : {}),
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      // Gemini 2.5 Flash: 65K output tokens disponíveis. Default generoso
      // pra não cortar documentos longos (ETP + TR + edital ≈ 15-25k).
      maxOutputTokens: opts.maxTokens ?? 32768,
    },
  })

  const contents: Content[] = [{ role: 'user', parts: [{ text: opts.userMessage }] }]
  const result = await model.generateContentStream({ contents })
  let lastFinishReason: string | undefined
  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) yield text
    // Capture finishReason do último candidate (só vem no chunk final)
    const finish = chunk.candidates?.[0]?.finishReason
    if (finish) lastFinishReason = finish
  }
  // MAX_TOKENS = Gemini cortou por limite de saída. SAFETY e RECITATION
  // sobem como erro mesmo, por isso não checamos aqui.
  if (lastFinishReason === 'MAX_TOKENS') yield TRUNCATION_MARKER
}
