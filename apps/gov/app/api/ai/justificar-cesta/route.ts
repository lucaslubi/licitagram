import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { streamText, AI_MODELS } from '@licitagram/gov-core/ai'
import { getCurrentProfile } from '@/lib/auth/profile'
import { logger } from '@/lib/logger'
import { friendlyAIError } from '@/lib/ai/error-message'

export const runtime = 'nodejs'
export const maxDuration = 60

const bodySchema = z.object({
  processoId: z.string().uuid(),
  itemDescricao: z.string().min(3),
  objeto: z.string().min(3),
  fontes: z
    .array(
      z.object({
        origem: z.enum(['pncp', 'painel_oficial']),
        orgaoNome: z.string().nullable(),
        modalidade: z.string().nullable(),
        dataReferencia: z.string().nullable(),
        quantidade: z.number().nullable(),
        unidadeMedida: z.string().nullable(),
        valorUnitario: z.number(),
        linkFonte: z.string().nullable(),
        justificativa: z.string(),
      }),
    )
    .min(1),
  stats: z.object({
    n: z.number(),
    media: z.number(),
    mediana: z.number(),
    menor: z.number(),
    maior: z.number(),
    cv: z.number(),
    complianceTcu1875: z.boolean(),
  }),
  metodo: z.enum(['media', 'mediana', 'menor']),
})

const SYSTEM = `Você é um assessor especializado em pesquisa de preços pra compras públicas (Lei 14.133/2021 e Acórdão TCU 1.875/2021).

Sua tarefa: redigir a NARRATIVA TÉCNICO-JURÍDICA que fundamenta a cesta de preços escolhida. Esse texto vai direto pro ETP (alínea VI — Estimativa do Valor), TR (alínea I — Estimativa da Contratação) e Parecer.

REGRAS DE ESCRITA:
- Tom: formal, técnico-administrativo. Sem coloquialismo.
- Linguagem objetiva. Parágrafos curtos. Nada de floreio.
- 180 a 300 palavras.
- Cite a base legal ao menos uma vez (Lei 14.133 art. 23, Acórdão TCU 1.875/2021).
- Inclua: metodologia (cesta de preços), quantidade de fontes, método escolhido (média/mediana/menor), intervalo temporal analisado, coeficiente de variação e sua interpretação.
- NÃO reproduza valores individuais das fontes. Mencione intervalo e medida central.
- Se houver fonte do Painel de Preços Oficial (origem = painel_oficial), DESTAQUE que foi priorizada por ser fonte autoritativa do governo federal.
- Se CV < 25%, afirme que "atende integralmente ao limite jurisprudencial do Acórdão TCU 1.875/2021".
- Se CV ≥ 25%, apontar como fragilidade e recomendar nova coleta.
- NÃO use markdown. Texto corrido em parágrafos.
- NÃO use placeholders [INSERIR X]. Use os dados reais fornecidos.`

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

  const fmt = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

  const fontesLinhas = body.fontes.map((f, i) => {
    const data = f.dataReferencia ? new Date(f.dataReferencia).toLocaleDateString('pt-BR') : 's/d'
    const qtd =
      f.quantidade != null ? `${f.quantidade.toLocaleString('pt-BR')} ${f.unidadeMedida ?? ''}` : 's/qtd'
    const origemLabel = f.origem === 'painel_oficial' ? 'Painel de Preços Oficial' : 'PNCP'
    return `[${i + 1}] ${origemLabel} · ${f.orgaoNome ?? 's/órgão'} · ${f.modalidade ?? 's/modalidade'} · ${data} · ${qtd} · ${fmt(f.valorUnitario)}`
  })

  const painelCount = body.fontes.filter((f) => f.origem === 'painel_oficial').length
  const pncpCount = body.fontes.filter((f) => f.origem === 'pncp').length

  const userMessage = `OBJETO DO PROCESSO: ${body.objeto}
ITEM: ${body.itemDescricao}

CESTA SELECIONADA (${body.stats.n} fontes): ${painelCount} do Painel Oficial + ${pncpCount} do PNCP

${fontesLinhas.join('\n')}

ESTATÍSTICAS:
- Média: ${fmt(body.stats.media)}
- Mediana: ${fmt(body.stats.mediana)}
- Menor: ${fmt(body.stats.menor)}
- Maior: ${fmt(body.stats.maior)}
- Coeficiente de variação: ${body.stats.cv.toFixed(2)}%
- Compliance TCU 1.875/2021: ${body.stats.complianceTcu1875 ? 'SIM (≥3 fontes e CV < 25%)' : 'NÃO — requer atenção'}
- Método escolhido: ${body.metodo === 'media' ? 'média aritmética' : body.metodo === 'mediana' ? 'mediana' : 'menor valor'}
- Valor final estimado: ${fmt(
    body.metodo === 'media' ? body.stats.media : body.metodo === 'mediana' ? body.stats.mediana : body.stats.menor,
  )}

Redija a narrativa técnico-jurídica fundamentando esta cesta.`

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const text of streamText({
          model: AI_MODELS.reasoning,
          system: SYSTEM,
          userMessage,
          maxTokens: 2048,
          temperature: 0.25,
        })) {
          if (!text) continue
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
      } catch (err) {
        logger.error({ err: err instanceof Error ? err.message : String(err) }, 'justificar-cesta failed')
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
