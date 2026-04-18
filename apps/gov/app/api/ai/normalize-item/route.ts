import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { streamText, AI_MODELS } from '@licitagram/gov-core/ai'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const maxDuration = 20

const bodySchema = z.object({
  descricao: z.string().min(3).max(500),
})

const SYSTEM = `Você recebe uma descrição livre de item de compra pública brasileira e retorna uma versão normalizada.

Saída obrigatoriamente JSON puro (sem markdown, sem comentários):
{
  "descricao_normalizada": "string breve, padronizada (até 120 chars)",
  "unidade_sugerida": "unid|resma|caixa|litro|metro|kg|...",
  "categoria": "string breve (material de escritório, limpeza, TI, medicamentos, etc.)",
  "catmat_sugerido": null
}

Se a descrição for genérica demais ou ambígua, use valores null nos campos opcionais. Nunca invente códigos CATMAT específicos (retorne null — base CATMAT entra em outra fase). Seja conciso.`

/**
 * POST /api/ai/normalize-item — público (sem auth)
 * Normaliza uma descrição livre de item → JSON com campos sugeridos.
 * Usado pelo form /s/[token] com debounce no client.
 */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'descricao inválida' }, { status: 400 })
  }

  let output = ''
  try {
    const chunks = streamText({
      model: AI_MODELS.fast,
      system: SYSTEM,
      userMessage: body.descricao,
      maxTokens: 512,
      temperature: 0.1,
    })
    for await (const chunk of chunks) {
      if (chunk) output += chunk
    }
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, 'normalize-item AI failed')
    return NextResponse.json({ error: 'IA indisponível' }, { status: 500 })
  }

  const jsonMatch = output.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return NextResponse.json({})
  try {
    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json({
      descricaoNormalizada: parsed.descricao_normalizada ?? null,
      unidade: parsed.unidade_sugerida ?? null,
      categoria: parsed.categoria ?? null,
      catmat: parsed.catmat_sugerido ?? null,
    })
  } catch {
    return NextResponse.json({})
  }
}
