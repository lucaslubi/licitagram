import { NextResponse, type NextRequest } from 'next/server'
import { streamMessage, CLAUDE_MODELS } from '@licitagram/gov-core/ai'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth/profile'
import {
  CONSOLIDATION_SYSTEM_PROMPT,
  renderConsolidationUserMessage,
  type ConsolidationItem,
} from '@/lib/pca/consolidation-prompt'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const maxDuration = 120

interface Body {
  campanhaId?: string
}

/**
 * POST /api/ai/consolidate-pca
 * Body: { campanhaId: UUID }
 * Retorna: text/event-stream (SSE)
 *   - cada linha "data: <token>\n\n"
 *   - termina com "data: [DONE]\n\n"
 *
 * Autorização: só admin/coordenador do órgão da campanha.
 */
export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const campanhaId = body.campanhaId
  if (!campanhaId) return NextResponse.json({ error: 'campanhaId obrigatório' }, { status: 400 })

  const profile = await getCurrentProfile()
  if (!profile) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!profile.orgao) return NextResponse.json({ error: 'Sem órgão' }, { status: 403 })
  if (profile.papel !== 'admin' && profile.papel !== 'coordenador') {
    return NextResponse.json({ error: 'Apenas admin/coordenador' }, { status: 403 })
  }

  const supabase = createClient()

  // Carrega itens da campanha (RPC já valida orgao_id contra current_orgao_id)
  const { data: itensData, error: itensErr } = await supabase.rpc(
    'get_campanha_itens_consolidacao',
    { p_campanha_id: campanhaId },
  )
  if (itensErr) {
    logger.error({ err: itensErr.message }, 'get_campanha_itens_consolidacao failed')
    return NextResponse.json({ error: itensErr.message }, { status: 500 })
  }
  const rows = (itensData ?? []) as Record<string, unknown>[]
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Nenhum item coletado ainda' }, { status: 400 })
  }

  // Busca título da campanha pra usar no prompt
  const { data: campDetail } = await supabase.rpc('get_campanha_detail', { p_campanha_id: campanhaId })
  const campanhaTitulo =
    Array.isArray(campDetail) && campDetail.length > 0
      ? ((campDetail[0] as Record<string, unknown>).titulo as string) ?? 'Campanha PCA'
      : 'Campanha PCA'

  const items: ConsolidationItem[] = rows.map((r) => ({
    itemId: r.item_id as string,
    setorNome: r.setor_nome as string,
    descricao: r.descricao_livre as string,
    quantidade: (r.quantidade as number | null) ?? null,
    unidadeMedida: (r.unidade_medida as string | null) ?? null,
    mesDemanda: (r.mes_demanda as number | null) ?? null,
    categoria: (r.categoria as string | null) ?? null,
    justificativa: (r.justificativa as string | null) ?? null,
  }))

  const userMsg = renderConsolidationUserMessage(items, campanhaTitulo)

  // Marca campanha como 'consolidando'
  await supabase.rpc('set_campanha_status', { p_campanha_id: campanhaId, p_status: 'consolidando' })

  // Stream Claude Opus
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let fullText = ''
      try {
        const claudeStream = streamMessage({
          model: CLAUDE_MODELS.opus,
          system: CONSOLIDATION_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMsg }],
          maxTokens: 4096,
          temperature: 0.2,
        })
        for await (const event of claudeStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const text = event.delta.text
            fullText += text
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
          }
        }
        // Persiste consolidação no DB
        await supabase.rpc('save_campanha_consolidacao', {
          p_campanha_id: campanhaId,
          p_consolidacao: {
            markdown: fullText,
            model: CLAUDE_MODELS.opus,
            generatedAt: new Date().toISOString(),
            itemCount: items.length,
          },
        })
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
      } catch (err) {
        logger.error({ err: err instanceof Error ? err.message : String(err) }, 'consolidation stream failed')
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
