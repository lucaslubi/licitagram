import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { streamText, AI_MODELS } from '@licitagram/gov-core/ai'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth/profile'
import { getProcessoDetail } from '@/lib/processos/queries'
import { PROMPTS, type ArtefatoTipo } from '@/lib/artefatos/prompts'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const maxDuration = 300

const bodySchema = z.object({
  processoId: z.string().uuid(),
  tipo: z.enum(['dfd', 'etp', 'mapa_riscos', 'tr', 'edital', 'parecer']),
})

/**
 * POST /api/ai/generate-artefato
 * Body: { processoId, tipo }
 * Response: text/event-stream — cada chunk "data: {text}" + "data: [DONE]"
 *
 * Escolhe modelo por `PROMPTS[tipo].provider` (fast vs reasoning) e rotear
 * via streamText (Gemini por padrão, Claude opcional).
 */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof z.ZodError ? e.issues[0]?.message : 'Entrada inválida' },
      { status: 400 },
    )
  }

  const profile = await getCurrentProfile()
  if (!profile) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (profile.papel !== 'admin' && profile.papel !== 'coordenador') {
    return NextResponse.json({ error: 'Apenas admin/coordenador' }, { status: 403 })
  }

  const processo = await getProcessoDetail(body.processoId)
  if (!processo) return NextResponse.json({ error: 'Processo não encontrado' }, { status: 404 })

  const spec = PROMPTS[body.tipo as ArtefatoTipo]
  if (!spec) return NextResponse.json({ error: 'tipo desconhecido' }, { status: 400 })

  const userMessage = spec.renderUser(processo)
  const modelId = spec.provider === 'reasoning' ? AI_MODELS.reasoning : AI_MODELS.fast
  const supabase = createClient()

  const encoder = new TextEncoder()
  const startedAt = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = ''
      try {
        const chunks = streamText({
          model: modelId,
          system: spec.system,
          userMessage,
          maxTokens: spec.maxTokens,
          temperature: spec.temperature,
        })
        for await (const text of chunks) {
          if (!text) continue
          fullText += text
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
        }

        // Persiste artefato
        const { error: saveErr } = await supabase.rpc('upsert_artefato', {
          p_processo_id: body.processoId,
          p_tipo: body.tipo,
          p_conteudo_markdown: fullText,
          p_modelo_usado: modelId,
          p_tokens_input: null,
          p_tokens_output: null,
          p_tempo_geracao_ms: Date.now() - startedAt,
          p_status: 'gerado',
          p_citacoes: null,
          p_compliance: null,
        })
        if (saveErr) {
          logger.error({ err: saveErr.message }, 'upsert_artefato failed')
        }

        // Avança fase_atual se apropriado (DFD→etp, ETP→riscos, riscos→precos, etc.)
        const NEXT_FASE: Record<string, string> = {
          dfd: 'etp', etp: 'riscos', mapa_riscos: 'precos', tr: 'compliance',
          edital: 'publicacao', parecer: 'edital',
        }
        const nextFase = NEXT_FASE[body.tipo]
        if (nextFase) {
          await supabase.rpc('set_processo_fase', { p_processo_id: body.processoId, p_fase: nextFase })
        }

        controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : String(err), tipo: body.tipo },
          'generate-artefato failed',
        )
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: err instanceof Error ? err.message : 'Falha na IA' })}\n\n`,
          ),
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
