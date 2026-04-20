import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { streamText, AI_MODELS } from '@licitagram/gov-core/ai'
import { getCurrentProfile } from '@/lib/auth/profile'
import { getProcessoDetail, listRiscos } from '@/lib/processos/queries'
import { listEstimativas } from '@/lib/precos/actions'
import { summarizeCompliance } from '@/lib/compliance/engine'
import { logger } from '@/lib/logger'
import { friendlyAIError } from '@/lib/ai/error-message'

export const runtime = 'nodejs'
export const maxDuration = 120

const bodySchema = z.object({
  processoId: z.string().uuid(),
})

const SYSTEM = `Você é assessor jurídico especializado em compras públicas (Lei 14.133/2021). Sua tarefa: redigir um PLANO DE AÇÃO para resolver as pendências de compliance identificadas num processo licitatório.

ESTRUTURA DO PLANO (use numeração em caixa alta, sem markdown):

PLANO DE AÇÃO — COMPLIANCE

Para cada pendência CRÍTICA e ALTA, produza um bloco:

[Severidade] — [Label da pendência]
Fundamento legal: [artigo/parágrafo/inciso da Lei 14.133/2021 ou Acórdão TCU]
Impacto: [o que acontece se for ao Edital com isto pendente — risco jurídico, TCU, anulação]
Ações necessárias: [bullets concretos com responsável e prazo sugerido]
Exemplo de redação: [se aplicável, sentença ou parágrafo que resolve a pendência quando copiada no artefato correspondente]

REGRAS:
- Tom técnico-administrativo. Sem coloquialismo.
- Seja CONCRETO: "revisar item 1.2 do ETP para incluir XYZ" > "melhorar o ETP".
- Quando a pendência é de quantitativo ou valor, sugerir fonte específica (Painel de Preços TCU, pesquisa com fornecedores, PNCP).
- Cite Lei 14.133 art./inciso e Acórdão TCU 1.875/2021 quando aplicável.
- NÃO invente dados do processo. Use só os fornecidos.
- NÃO produza bloco para pendências de severidade BAIXA, MÉDIA ou INFO — só CRÍTICA e ALTA.
- Se não houver pendências crítica/alta, retorne apenas: "Sem pendências críticas ou altas. Processo apto a seguir para elaboração do Edital."
- 200 a 700 palavras.`

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

  const [riscos, estimativas] = await Promise.all([
    listRiscos(body.processoId),
    listEstimativas(body.processoId),
  ])
  const summary = summarizeCompliance({ processo, riscos, estimativas })

  const pendencias = summary.checks
    .filter((c) => !c.passed && (c.severity === 'critica' || c.severity === 'alta'))
    .map((c, i) => {
      const cit = c.citation
        ? `${c.citation.lei}${c.citation.artigo ? `, art. ${c.citation.artigo}` : ''}${
            c.citation.paragrafo ? ` §${c.citation.paragrafo}` : ''
          }${c.citation.inciso ? `, inc. ${c.citation.inciso}` : ''}${
            c.citation.acordao ? ` · ${c.citation.acordao}` : ''
          }`
        : 'sem citação direta'
      return `${i + 1}. [${c.severity.toUpperCase()}] ${c.label}
   Detalhe: ${c.detail}
   Fundamento: ${cit}`
    })

  if (pendencias.length === 0) {
    // Fast-path: sem pendências críticas/altas, retorna texto pronto sem
    // chamar IA (economiza token e latência).
    const encoder = new TextEncoder()
    return new Response(
      new ReadableStream({
        start(controller) {
          const msg =
            'Sem pendências críticas ou altas no Compliance Engine. O processo está apto a prosseguir para elaboração do Edital. Sugestão: revise os alertas informativos antes da publicação.'
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: msg })}\n\n`))
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
          controller.close()
        },
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      },
    )
  }

  const userMessage = `PROCESSO
Objeto: ${processo.objeto}
Modalidade prevista: ${processo.modalidade ?? 'a definir'}
Fase atual: ${processo.faseAtual}
Valor estimado: ${
    processo.valorEstimado
      ? `R$ ${processo.valorEstimado.toLocaleString('pt-BR')}`
      : 'a definir'
  }

DADOS COMPLEMENTARES
Artefatos gerados: ${processo.artefatos.map((a) => `${a.tipo}(${a.status})`).join(', ') || 'nenhum'}
Riscos catalogados: ${riscos.length}
Estimativas de preço salvas: ${estimativas.length}

PENDÊNCIAS A RESOLVER (${pendencias.length}):

${pendencias.join('\n\n')}

Redija o plano de ação.`

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const text of streamText({
          model: AI_MODELS.reasoning,
          system: SYSTEM,
          userMessage,
          maxTokens: 4096,
          temperature: 0.2,
        })) {
          if (!text) continue
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
      } catch (err) {
        logger.error({ err: err instanceof Error ? err.message : String(err) }, 'plano-compliance failed')
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: friendlyAIError(err) })}\n\n`),
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
