import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { streamText, AI_MODELS } from '@licitagram/gov-core/ai'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth/profile'
import { getProcessoDetail } from '@/lib/processos/queries'
import { PROMPTS } from '@/lib/artefatos/prompts'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const maxDuration = 120

const bodySchema = z.object({ processoId: z.string().uuid() })

const RiscoZ = z.object({
  fase: z.enum(['planejamento', 'externa', 'execucao', 'regulatorio']).optional(),
  descricao: z.string().min(3),
  probabilidade: z.enum(['baixa', 'media', 'alta']).optional(),
  impacto: z.enum(['baixo', 'medio', 'alto']).optional(),
  nivel_risco: z.enum(['baixo', 'medio', 'alto']).optional(),
  responsavel: z.enum(['contratante', 'contratado', 'compartilhado']).optional(),
  tratamento: z.string().optional(),
  mitigacao: z.string().optional(),
})

export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'processoId obrigatório' }, { status: 400 })
  }

  const profile = await getCurrentProfile()
  if (!profile) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (profile.papel !== 'admin' && profile.papel !== 'coordenador') {
    return NextResponse.json({ error: 'Apenas admin/coordenador' }, { status: 403 })
  }

  const processo = await getProcessoDetail(body.processoId)
  if (!processo) return NextResponse.json({ error: 'Processo não encontrado' }, { status: 404 })

  const spec = PROMPTS.mapa_riscos
  const userMessage = spec.renderUser(processo)

  let output = ''
  try {
    const chunks = streamText({
      model: AI_MODELS.reasoning,
      system: spec.system,
      userMessage,
      maxTokens: spec.maxTokens,
      temperature: spec.temperature,
    })
    for await (const text of chunks) {
      if (text) output += text
    }
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, 'generate-riscos IA failed')
    return NextResponse.json({ error: 'Falha na IA' }, { status: 500 })
  }

  // Extrai JSON (IA pode incluir markdown ou comentários)
  const jsonMatch = output.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return NextResponse.json({ error: 'Resposta da IA sem JSON válido' }, { status: 502 })
  }
  let parsed: { riscos?: unknown[] }
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return NextResponse.json({ error: 'JSON da IA malformado' }, { status: 502 })
  }

  const validRiscos: z.infer<typeof RiscoZ>[] = []
  for (const r of parsed.riscos ?? []) {
    const p = RiscoZ.safeParse(r)
    if (p.success) validRiscos.push(p.data)
  }
  if (validRiscos.length === 0) {
    return NextResponse.json({ error: 'Nenhum risco válido retornado' }, { status: 502 })
  }

  const supabase = createClient()
  const { error: saveErr } = await supabase.rpc('save_riscos', {
    p_processo_id: body.processoId,
    p_riscos: validRiscos,
  })
  if (saveErr) {
    logger.error({ err: saveErr.message }, 'save_riscos RPC failed')
    return NextResponse.json({ error: saveErr.message }, { status: 500 })
  }

  // Também persiste um artefato markdown para visualização/auditoria
  const markdown = renderRiscosMarkdown(validRiscos)
  await supabase.rpc('upsert_artefato', {
    p_processo_id: body.processoId,
    p_tipo: 'mapa_riscos',
    p_conteudo_markdown: markdown,
    p_modelo_usado: AI_MODELS.reasoning,
    p_tokens_input: null,
    p_tokens_output: null,
    p_tempo_geracao_ms: null,
    p_status: 'gerado',
    p_citacoes: null,
    p_compliance: null,
  })
  await supabase.rpc('set_processo_fase', {
    p_processo_id: body.processoId,
    p_fase: 'precos',
  })

  return NextResponse.json({ ok: true, count: validRiscos.length })
}

function renderRiscosMarkdown(riscos: z.infer<typeof RiscoZ>[]): string {
  const lines = ['# Mapa de Riscos', '', `Total de riscos identificados: **${riscos.length}**`, '']
  const byFase = new Map<string, typeof riscos>()
  for (const r of riscos) {
    const f = r.fase ?? 'outras'
    if (!byFase.has(f)) byFase.set(f, [])
    byFase.get(f)!.push(r)
  }
  const ORDER: Record<string, string> = {
    planejamento: '1. Fase de planejamento',
    externa: '2. Fase externa',
    execucao: '3. Execução',
    regulatorio: '4. Regulatório',
    outras: '5. Outras',
  }
  for (const [fase, title] of Object.entries(ORDER)) {
    const items = byFase.get(fase)
    if (!items || items.length === 0) continue
    lines.push(`## ${title}`)
    for (const r of items) {
      lines.push(`- **${r.descricao}**`)
      lines.push(`  - Probabilidade: ${r.probabilidade ?? '—'} · Impacto: ${r.impacto ?? '—'} · Nível: ${r.nivel_risco ?? '—'}`)
      if (r.responsavel) lines.push(`  - Responsável: ${r.responsavel}`)
      if (r.tratamento) lines.push(`  - Tratamento: ${r.tratamento}`)
      if (r.mitigacao) lines.push(`  - Mitigação: ${r.mitigacao}`)
    }
    lines.push('')
  }
  lines.push('---')
  lines.push('_Base legal: Lei 14.133/2021 art. 18 §1º X, art. 22; IN SEGES/ME 65/2021._')
  return lines.join('\n')
}
