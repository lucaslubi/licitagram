'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth/profile'

export interface CatalogoItem {
  id: string
  codigoCatmat: string | null
  codigoCatser: string | null
  descricaoOficial: string
  descricaoNormalizada: string | null
  unidadeMedida: string | null
  categoria: string | null
  usoCount: number
  aliases: string[]
  criadoEm: string
  scope: 'global' | 'orgao'
}

export async function listCatalogo(query?: string | null, limit = 100): Promise<CatalogoItem[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('list_catalogo', {
    p_query: query && query.trim().length > 0 ? query.trim() : null,
    p_limit: limit,
  })
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    codigoCatmat: (r.codigo_catmat as string | null) ?? null,
    codigoCatser: (r.codigo_catser as string | null) ?? null,
    descricaoOficial: r.descricao_oficial as string,
    descricaoNormalizada: (r.descricao_normalizada as string | null) ?? null,
    unidadeMedida: (r.unidade_medida as string | null) ?? null,
    categoria: (r.categoria as string | null) ?? null,
    usoCount: Number(r.uso_count ?? 0),
    aliases: ((r.aliases as string[]) ?? []) as string[],
    criadoEm: r.criado_em as string,
    scope: (r.scope as string) === 'global' ? 'global' : 'orgao',
  }))
}

const itemSchema = z.object({
  id: z.string().uuid().nullable(),
  codigoCatmat: z.string().max(20).nullable(),
  codigoCatser: z.string().max(20).nullable(),
  descricaoOficial: z.string().min(3).max(500),
  descricaoNormalizada: z.string().max(500).nullable(),
  unidadeMedida: z.string().max(50).nullable(),
  categoria: z.string().max(100).nullable(),
  aliases: z.array(z.string().max(100)).max(20),
})
export type CatalogoItemInput = z.infer<typeof itemSchema>

export async function upsertCatalogoItemAction(
  input: CatalogoItemInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const profile = await getCurrentProfile()
  if (!profile?.orgao) return { ok: false, error: 'Sem órgão' }
  if (profile.papel !== 'admin' && profile.papel !== 'coordenador') {
    return { ok: false, error: 'Apenas admin/coordenador pode editar o catálogo' }
  }
  const parsed = itemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Entrada inválida' }
  }
  const supabase = createClient()
  const { data, error } = await supabase.rpc('upsert_catalogo_item', {
    p_id: parsed.data.id,
    p_codigo_catmat: parsed.data.codigoCatmat,
    p_codigo_catser: parsed.data.codigoCatser,
    p_descricao_oficial: parsed.data.descricaoOficial,
    p_descricao_normalizada: parsed.data.descricaoNormalizada,
    p_unidade_medida: parsed.data.unidadeMedida,
    p_categoria: parsed.data.categoria,
    p_aliases: parsed.data.aliases,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/catalogo')
  return { ok: true, id: data as string }
}

export async function deleteCatalogoItemAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient()
  const { error } = await supabase.rpc('delete_catalogo_item', { p_id: id })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/catalogo')
  return { ok: true }
}
