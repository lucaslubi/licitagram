'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth/profile'
import { logger } from '@/lib/logger'
import { processoSchema, type ProcessoInput } from '@/lib/validations/processo'

type ActionResult = { ok: true; processoId: string } | { ok: false; error: string; field?: string }

export async function createProcessoAction(input: ProcessoInput): Promise<ActionResult> {
  let parsed: ProcessoInput
  try {
    parsed = processoSchema.parse(input)
  } catch (e) {
    if (e instanceof z.ZodError) {
      const first = e.issues[0]
      return { ok: false, error: first?.message ?? 'Entrada inválida', field: first?.path?.[0]?.toString() }
    }
    return { ok: false, error: 'Entrada inválida' }
  }

  const profile = await getCurrentProfile()
  if (!profile?.orgao) return { ok: false, error: 'Sem órgão' }
  if (profile.papel !== 'admin' && profile.papel !== 'coordenador') {
    return { ok: false, error: 'Apenas admin/coordenador pode criar processo' }
  }

  const supabase = createClient()
  const { data, error } = await supabase.rpc('create_processo', {
    p_objeto: parsed.objeto,
    p_tipo: parsed.tipo,
    p_modalidade: parsed.modalidade ?? null,
    p_setor_requisitante_id: parsed.setorRequisitanteId ?? null,
    p_valor_estimado: parsed.valorEstimado ?? null,
    p_campanha_pca_id: parsed.campanhaPcaId ?? null,
  })
  if (error) {
    logger.error({ err: error.message }, 'create_processo RPC failed')
    return { ok: false, error: error.message }
  }

  revalidatePath('/processos')
  revalidatePath('/dashboard')
  return { ok: true, processoId: data as string }
}

export async function approveArtefatoAction(artefatoId: string, processoId: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('approve_artefato', { p_artefato_id: artefatoId })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/processos/${processoId}`)
  return { ok: true }
}

/**
 * Atualiza o conteúdo de um artefato. Admin/coordenador only.
 * Registra nova versão via upsert_artefato (lida com versionamento).
 */
export async function updateArtefatoAction(
  processoId: string,
  tipo: string,
  markdown: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getCurrentProfile()
  if (!profile?.orgao) return { ok: false, error: 'Sem órgão' }
  if (profile.papel !== 'admin' && profile.papel !== 'coordenador') {
    return { ok: false, error: 'Apenas admin/coordenador pode editar' }
  }
  if (!markdown || markdown.trim().length < 10) {
    return { ok: false, error: 'Conteúdo muito curto' }
  }
  const supabase = createClient()
  const { error } = await supabase.rpc('upsert_artefato', {
    p_processo_id: processoId,
    p_tipo: tipo,
    p_conteudo_markdown: markdown,
    p_modelo_usado: 'human-edit',
    p_tokens_input: null,
    p_tokens_output: null,
    p_tempo_geracao_ms: 0,
    p_status: 'gerado',
    p_citacoes: null,
    p_compliance: null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/processos/${processoId}`)
  return { ok: true }
}

export async function setProcessoFaseAction(processoId: string, fase: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('set_processo_fase', {
    p_processo_id: processoId,
    p_fase: fase,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/processos/${processoId}`)
  return { ok: true }
}
