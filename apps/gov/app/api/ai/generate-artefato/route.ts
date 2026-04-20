import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { streamText, AI_MODELS, retrieveContext, formatContext } from '@licitagram/gov-core/ai'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth/profile'
import { getProcessoDetail } from '@/lib/processos/queries'
import { PROMPTS, stripMarkdownChrome, type ArtefatoTipo } from '@/lib/artefatos/prompts'
import { buildUpstreamContext } from '@/lib/artefatos/upstream-context'
import { logger } from '@/lib/logger'
import { friendlyAIError } from '@/lib/ai/error-message'
import { searchPrecosPncp, getPrecoStats } from '@/lib/precos/pncp-engine'

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
  if (!profile.orgao) return NextResponse.json({ error: 'Órgão não configurado' }, { status: 400 })

  const processo = await getProcessoDetail(body.processoId)
  if (!processo) return NextResponse.json({ error: 'Processo não encontrado' }, { status: 404 })

  const spec = PROMPTS[body.tipo as ArtefatoTipo]
  if (!spec) return NextResponse.json({ error: 'tipo desconhecido' }, { status: 400 })

  const now = new Date()
  const ctx = {
    orgaoRazaoSocial: profile.orgao.razaoSocial,
    orgaoNomeFantasia: profile.orgao.nomeFantasia,
    orgaoCnpj: profile.orgao.cnpj,
    orgaoEsfera: profile.orgao.esfera,
    orgaoUf: profile.orgao.uf,
    orgaoMunicipio: profile.orgao.municipio,
    unidadeNome: processo.setorNome,
    responsavelNome: profile.nomeCompleto,
    responsavelCargo: profile.cargo,
    responsavelPapel: profile.papel,
    dataEmissao: now.toLocaleDateString('pt-BR'),
    anoExercicio: now.getFullYear(),
  }
  const userMessage = spec.renderUser(processo, ctx)
  const modelId = spec.provider === 'reasoning' ? AI_MODELS.reasoning : AI_MODELS.fast
  const supabase = createClient()

  // RAG: busca até 8 trechos relevantes do corpus (AGU + PAM + Lei 14.133 + TCU)
  // e injeta no system prompt pra IA citar os modelos oficiais.
  let ragContext = ''
  try {
    const retrievalQuery = `${body.tipo} ${processo.objeto} ${processo.modalidade ?? ''}`.trim()
    const chunks = await retrieveContext(supabase, retrievalQuery, {
      artefatoTipo: body.tipo,
      modalidade: processo.modalidade ?? undefined,
      limit: 8,
    })
    ragContext = formatContext(chunks)
    logger.info({ processoId: body.processoId, tipo: body.tipo, chunks: chunks.length }, 'RAG context retrieved')
  } catch (e) {
    // RAG failure é não-fatal: prossegue com prompt vanilla.
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, 'RAG retrieval failed — proceeding without context')
  }

  // Fase 2C: enriquece prompt com contratações análogas do PNCP (B2B price
  // intelligence). Aplica só em artefatos onde preço é materialmente relevante:
  // ETP (inciso VI), TR (alínea i), parecer (auditoria cesta). Outros tipos
  // não recebem — evita poluir o prompt do DFD/edital com preços.
  const TIPOS_COM_PRECO: ArtefatoTipo[] = ['etp', 'tr', 'parecer']
  let precosContext = ''
  if (TIPOS_COM_PRECO.includes(body.tipo)) {
    try {
      const [rows, stats] = await Promise.all([
        searchPrecosPncp({ query: processo.objeto.slice(0, 100), limit: 5 }),
        getPrecoStats({ query: processo.objeto.slice(0, 100) }),
      ])
      if (rows.length > 0 && stats && stats.n >= 3) {
        const lines = rows.slice(0, 5).map((r, i) => {
          const data = r.dataPublicacao ? new Date(r.dataPublicacao).toLocaleDateString('pt-BR') : '—'
          return `[${i + 1}] ${r.orgaoNome.slice(0, 50)} — ${r.modalidadeNome ?? 'modalidade n/i'} — R$ ${r.valorUnitario.toFixed(2)} — ${data}`
        })
        precosContext = `
CONTRATAÇÕES ANÁLOGAS NO PNCP (amostra real de ${stats.n} contratações)

Estatísticas agregadas:
- Mediana: R$ ${stats.mediana.toFixed(2)}
- Média: R$ ${stats.media.toFixed(2)}
- Intervalo: R$ ${stats.minimo.toFixed(2)} a R$ ${stats.maximo.toFixed(2)}
- CV: ${stats.cv.toFixed(1)}%${stats.complianceTcu1875 ? ' (Acórdão TCU 1.875/2021 atendido)' : ''}

Fontes analisadas (top 5 mais recentes):
${lines.join('\n')}

Use estes dados quando mencionar valor estimado/preços no artefato. Cite
"contratações análogas no PNCP" (sem expor dados de terceiros além do órgão).
Jamais invente valores — se a amostra for insuficiente, escreva "a confirmar
via pesquisa de preços detalhada".`
      }
    } catch (e) {
      logger.warn({ err: e instanceof Error ? e.message : String(e) }, 'PNCP price enrichment failed')
    }
  }

  // Upstream artefatos: DFD→ETP, DFD+ETP→Riscos, tudo→TR etc. Sem isto,
  // cada artefato gera em vácuo e contradiz os anteriores. Falha é
  // não-fatal — prossegue sem contexto se buscar deu ruim.
  let upstreamContext = ''
  try {
    upstreamContext = await buildUpstreamContext(body.processoId, body.tipo as ArtefatoTipo)
    if (upstreamContext) {
      logger.info(
        { processoId: body.processoId, tipo: body.tipo, upstreamChars: upstreamContext.length },
        'upstream artefato context attached',
      )
    }
  } catch (e) {
    logger.warn(
      { err: e instanceof Error ? e.message : String(e) },
      'upstream context build failed — proceeding vanilla',
    )
  }

  const systemWithContext = [spec.system, upstreamContext, ragContext, precosContext]
    .filter(Boolean)
    .join('\n\n')

  const encoder = new TextEncoder()
  const startedAt = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = ''
      try {
        const chunks = streamText({
          model: modelId,
          system: systemWithContext,
          userMessage,
          maxTokens: spec.maxTokens,
          temperature: spec.temperature,
        })
        // Buffer por linha: stripMarkdownChrome é seguro quando aplicado a linhas
        // inteiras, não a chunks parciais. Emitimos ao cliente ao fechar cada linha.
        let lineBuffer = ''
        const flushLine = (line: string, terminator: string) => {
          const clean = body.tipo === 'mapa_riscos' ? line : stripMarkdownChrome(line)
          fullText += clean + terminator
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: clean + terminator })}\n\n`))
        }
        for await (const text of chunks) {
          if (!text) continue
          lineBuffer += text
          let idx
          while ((idx = lineBuffer.indexOf('\n')) !== -1) {
            flushLine(lineBuffer.slice(0, idx), '\n')
            lineBuffer = lineBuffer.slice(idx + 1)
          }
        }
        if (lineBuffer.length > 0) flushLine(lineBuffer, '')

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
            `data: ${JSON.stringify({ error: friendlyAIError(err) })}\n\n`,
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
