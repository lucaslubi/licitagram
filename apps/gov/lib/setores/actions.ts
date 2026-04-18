'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth/profile'
import { logger } from '@/lib/logger'
import { setorSchema, type SetorInput } from '@/lib/validations/setor'

export interface SetorRow {
  id: string
  nome: string
  sigla: string | null
  responsavelId: string | null
  responsavelNome: string | null
  ativo: boolean
  criadoEm: string
}

type ActionResult = { ok: true } | { ok: false; error: string; field?: string }

function mapError(err: unknown): ActionResult {
  if (err instanceof z.ZodError) {
    const first = err.issues[0]
    return { ok: false, error: first?.message ?? 'Entrada inválida', field: first?.path?.[0]?.toString() }
  }
  if (err instanceof Error) return { ok: false, error: err.message }
  return { ok: false, error: 'Erro desconhecido' }
}

export async function listSetoresAction(): Promise<SetorRow[]> {
  const profile = await getCurrentProfile()
  if (!profile?.orgao) return []
  const supabase = createClient()
  const { data, error } = await supabase
    .schema('licitagov')
    .from('setores')
    .select('id, nome, sigla, responsavel_id, ativo, criado_em, usuarios:responsavel_id(nome_completo)')
    .eq('orgao_id', profile.orgao.id)
    .order('nome')
  if (error) {
    logger.error({ err: error.message }, 'listSetoresAction failed')
    return []
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    nome: row.nome as string,
    sigla: (row.sigla as string | null) ?? null,
    responsavelId: (row.responsavel_id as string | null) ?? null,
    responsavelNome: ((row as unknown as { usuarios?: { nome_completo?: string | null } | null }).usuarios?.nome_completo) ?? null,
    ativo: row.ativo as boolean,
    criadoEm: row.criado_em as string,
  }))
}

export async function createSetorAction(input: SetorInput): Promise<ActionResult> {
  try {
    const parsed = setorSchema.parse(input)
    const profile = await getCurrentProfile()
    if (!profile?.orgao) return { ok: false, error: 'Sem órgão cadastrado' }
    const supabase = createClient()
    const { error } = await supabase
      .schema('licitagov')
      .from('setores')
      .insert({
        orgao_id: profile.orgao.id,
        nome: parsed.nome,
        sigla: parsed.sigla || null,
        responsavel_id: parsed.responsavelId || null,
      })
    if (error) {
      logger.error({ err: error.message, code: error.code }, 'createSetorAction DB failed')
      return { ok: false, error: error.message }
    }
    revalidatePath('/configuracoes/setores')
    return { ok: true }
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, 'createSetorAction failed')
    return mapError(e)
  }
}

export async function updateSetorAction(id: string, input: SetorInput): Promise<ActionResult> {
  try {
    const parsed = setorSchema.parse(input)
    const supabase = createClient()
    const { error } = await supabase
      .schema('licitagov')
      .from('setores')
      .update({
        nome: parsed.nome,
        sigla: parsed.sigla || null,
        responsavel_id: parsed.responsavelId || null,
      })
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/configuracoes/setores')
    return { ok: true }
  } catch (e) {
    return mapError(e)
  }
}

export async function deleteSetorAction(id: string): Promise<ActionResult> {
  try {
    const supabase = createClient()
    // Soft-delete preferido: apenas desativa. Mantém integridade referencial
    // com respostas_setor históricas.
    const { error } = await supabase
      .schema('licitagov')
      .from('setores')
      .update({ ativo: false })
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/configuracoes/setores')
    return { ok: true }
  } catch (e) {
    return mapError(e)
  }
}
