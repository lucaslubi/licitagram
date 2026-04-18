import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { streamText, AI_MODELS } from '@licitagram/gov-core/ai'
import { createClient } from '@/lib/supabase/server'
import { hashToken } from '@/lib/crypto/token'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const maxDuration = 60

const bodySchema = z.object({
  token: z.string().min(16),
  setorNome: z.string().min(1),
})

const SYSTEM = `Você é um assistente que sugere itens pra um PCA (Plano de Contratações Anual) com base no histórico de compras do órgão no PNCP.

Recebe uma lista de objetos contratados pelo mesmo órgão nos últimos anos. Gera sugestões de itens que façam sentido pro setor informado, agrupando categorias similares.

Saída obrigatoriamente JSON com este formato (sem markdown, só JSON):
{
  "sugestoes": [
    { "descricao": "string clara e objetiva", "unidade": "unid|litro|caixa|etc", "categoria": "string breve" }
  ]
}

Máximo 8 sugestões. Não invente itens que não aparecem no histórico — só agrupe e adapte o que já foi comprado. Se o histórico for pobre ou irrelevante pro setor, retorne array vazio.`

/**
 * POST /api/ai/suggest-items-from-history
 * Público via token (valida via RPC get_orgao_historico_pncp).
 * Retorna JSON com sugestões de itens. Não streaming — resposta curta.
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

  const supabase = createClient()
  const hash = hashToken(body.token)
  const { data, error } = await supabase.rpc('get_orgao_historico_pncp', {
    p_token_hash: hash,
    p_limit: 40,
  })
  if (error) {
    logger.error({ err: error.message }, 'get_orgao_historico_pncp failed')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const rows = (data ?? []) as Record<string, unknown>[]
  if (rows.length === 0) {
    return NextResponse.json({ sugestoes: [] })
  }

  const historicoText = rows
    .slice(0, 30)
    .map((r, i) => {
      const objeto = String(r.objeto ?? '').slice(0, 200)
      const valor = r.valor_homologado ?? r.valor_estimado
      const data = r.data_publicacao ? String(r.data_publicacao).slice(0, 10) : '—'
      return `${i + 1}. [${data}] ${objeto} ${valor ? `· R$ ${valor}` : ''}`
    })
    .join('\n')

  const userMsg = `Setor: ${body.setorNome}

Histórico de compras (PNCP, mesmo órgão):
${historicoText}

Gere sugestões JSON para esse setor.`

  let output = ''
  try {
    const chunks = streamText({
      model: AI_MODELS.fast,
      system: SYSTEM,
      userMessage: userMsg,
      maxTokens: 2048,
      temperature: 0.3,
    })
    for await (const chunk of chunks) {
      if (chunk) output += chunk
    }
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, 'suggest-items AI failed')
    return NextResponse.json({ error: 'Falha ao consultar IA' }, { status: 500 })
  }

  // Parse JSON (IA às vezes acompanha markdown; extrai bloco JSON)
  const jsonMatch = output.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return NextResponse.json({ sugestoes: [] })
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { sugestoes?: Array<{ descricao?: string; unidade?: string; categoria?: string }> }
    const list = (parsed.sugestoes ?? [])
      .filter((s) => typeof s.descricao === 'string' && s.descricao.length > 2)
      .slice(0, 8)
      .map((s) => ({
        descricao: s.descricao!.slice(0, 200),
        unidade: s.unidade?.slice(0, 50) ?? null,
        categoria: s.categoria?.slice(0, 100) ?? null,
      }))
    return NextResponse.json({ sugestoes: list, basedOn: rows.length })
  } catch {
    return NextResponse.json({ sugestoes: [] })
  }
}
