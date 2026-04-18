'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth/profile'
import { logger } from '@/lib/logger'
import { summarize } from './compliance'
import type { ConsolidationItem } from './consolidation-prompt'

type Result = { ok: true } | { ok: false; error: string }

export async function getConsolidationItems(campanhaId: string): Promise<ConsolidationItem[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_campanha_itens_consolidacao', { p_campanha_id: campanhaId })
  if (error) {
    logger.error({ err: error.message }, 'get_campanha_itens_consolidacao query failed')
    return []
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    itemId: r.item_id as string,
    setorNome: r.setor_nome as string,
    descricao: r.descricao_livre as string,
    quantidade: (r.quantidade as number | null) ?? null,
    unidadeMedida: (r.unidade_medida as string | null) ?? null,
    mesDemanda: (r.mes_demanda as number | null) ?? null,
    categoria: (r.categoria as string | null) ?? null,
    justificativa: (r.justificativa as string | null) ?? null,
  }))
}

export async function getConsolidationMarkdown(campanhaId: string): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_campanha_consolidacao', { p_campanha_id: campanhaId })
  if (error) return null
  const json = data as { markdown?: string } | null
  return json?.markdown ?? null
}

export async function approveCampanhaAction(campanhaId: string): Promise<Result> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Não autenticado' }
  if (profile.papel !== 'admin' && profile.papel !== 'coordenador') {
    return { ok: false, error: 'Apenas admin/coordenador' }
  }
  const items = await getConsolidationItems(campanhaId)
  const { canPublish, criticas } = summarize(items)
  if (!canPublish) {
    return { ok: false, error: `Bloqueado: ${criticas} pendência(s) crítica(s) de compliance` }
  }
  const supabase = createClient()
  const { error } = await supabase.rpc('set_campanha_status', {
    p_campanha_id: campanhaId,
    p_status: 'aprovado',
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/pca/${campanhaId}`)
  revalidatePath('/pca')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function publishCampanhaAction(campanhaId: string): Promise<Result> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Não autenticado' }
  if (profile.papel !== 'admin' && profile.papel !== 'coordenador') {
    return { ok: false, error: 'Apenas admin/coordenador' }
  }
  const items = await getConsolidationItems(campanhaId)
  const { canPublish, criticas } = summarize(items)
  if (!canPublish) {
    return { ok: false, error: `Bloqueado: ${criticas} pendência(s) crítica(s)` }
  }
  const supabase = createClient()
  // Por ora apenas marca como 'publicado' localmente. Integração com PNCP
  // entra na Fase 9 (precisa de certificado ICP-Brasil + API PNCP v2.3).
  const { error } = await supabase.rpc('set_campanha_status', {
    p_campanha_id: campanhaId,
    p_status: 'publicado',
  })
  if (error) return { ok: false, error: error.message }
  logger.info({ campanhaId }, 'PCA marcado como publicado (PNCP API não integrado ainda — Fase 9)')
  revalidatePath(`/pca/${campanhaId}`)
  revalidatePath('/pca')
  revalidatePath('/dashboard')
  return { ok: true }
}
