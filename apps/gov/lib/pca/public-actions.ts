'use server'

import { createClient } from '@/lib/supabase/server'
import { hashToken } from '@/lib/crypto/token'
import { logger } from '@/lib/logger'
import type { ItemPcaInput } from '@/lib/validations/pca'
import { itemPcaSchema } from '@/lib/validations/pca'

export interface TokenResolution {
  respostaId: string
  campanhaId: string
  campanhaAno: number
  campanhaTitulo: string
  campanhaStatus: string
  setorId: string
  setorNome: string
  setorSigla: string | null
  orgaoId: string
  orgaoRazaoSocial: string
  orgaoNomeFantasia: string | null
  expiraEm: string
  respondidoEm: string | null
}

/**
 * Resolve a public token (from /s/[token]) to campanha+setor context.
 * Returns null if the token is invalid, revoked or expired — UI shows a
 * friendly "link inválido" state without leaking details.
 */
export async function resolveTokenAction(token: string): Promise<TokenResolution | null> {
  if (!token || token.length < 16) return null
  const supabase = createClient()
  const hash = hashToken(token)
  const { data, error } = await supabase.rpc('resolve_campanha_token', { p_token_hash: hash })
  if (error) {
    logger.error({ err: error.message }, 'resolve_campanha_token failed')
    return null
  }
  const rows = (data ?? []) as Record<string, unknown>[]
  const row = rows[0]
  if (!row) return null
  return {
    respostaId: row.resposta_id as string,
    campanhaId: row.campanha_id as string,
    campanhaAno: row.campanha_ano as number,
    campanhaTitulo: row.campanha_titulo as string,
    campanhaStatus: row.campanha_status as string,
    setorId: row.setor_id as string,
    setorNome: row.setor_nome as string,
    setorSigla: (row.setor_sigla as string | null) ?? null,
    orgaoId: row.orgao_id as string,
    orgaoRazaoSocial: row.orgao_razao_social as string,
    orgaoNomeFantasia: (row.orgao_nome_fantasia as string | null) ?? null,
    expiraEm: row.expira_em as string,
    respondidoEm: (row.respondido_em as string | null) ?? null,
  }
}

type SubmitResult = { ok: true; inserted: number } | { ok: false; error: string }

export async function submitSetorItensAction(
  token: string,
  itens: ItemPcaInput[],
): Promise<SubmitResult> {
  if (!token) return { ok: false, error: 'Link inválido' }
  if (itens.length === 0) return { ok: false, error: 'Adicione pelo menos 1 item' }

  // Valida cada item individualmente — descarta os inválidos, não bloqueia todos.
  const clean: ItemPcaInput[] = []
  for (const raw of itens) {
    const parsed = itemPcaSchema.safeParse(raw)
    if (parsed.success) clean.push(parsed.data)
  }
  if (clean.length === 0) return { ok: false, error: 'Nenhum item com descrição válida (mínimo 3 caracteres)' }

  const supabase = createClient()
  const hash = hashToken(token)
  const { data, error } = await supabase.rpc('submit_setor_itens', {
    p_token_hash: hash,
    p_itens: clean.map((i) => ({
      descricao_livre: i.descricaoLivre,
      quantidade: i.quantidade != null ? String(i.quantidade) : '',
      unidade_medida: i.unidadeMedida ?? '',
      mes_demanda: i.mesDemanda != null ? String(i.mesDemanda) : '',
      justificativa: i.justificativa ?? '',
    })),
  })
  if (error) {
    logger.error({ err: error.message }, 'submit_setor_itens failed')
    return { ok: false, error: error.message }
  }
  return { ok: true, inserted: (data as number | null) ?? clean.length }
}
