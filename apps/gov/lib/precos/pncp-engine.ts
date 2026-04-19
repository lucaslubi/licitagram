'use server'

import { createClient } from '@/lib/supabase/server'

export interface PrecoPncpRow {
  itemId: string
  descricao: string
  quantidade: number | null
  unidadeMedida: string | null
  valorUnitario: number
  valorTotal: number | null
  categoria: string | null
  orgaoCnpj: string | null
  orgaoNome: string
  orgaoEsfera: string | null
  modalidadeNome: string | null
  dataPublicacao: string | null
  anoCompra: number | null
  pncpId: string
  linkPncp: string | null
  valorHomologado: number | null
}

export interface PrecoStats {
  n: number
  media: number
  mediana: number
  minimo: number
  maximo: number
  desvioPadrao: number
  cv: number
  complianceTcu1875: boolean
}

export interface PrecoSearchFilters {
  query: string
  uf?: string | null
  modalidade?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  limit?: number
}

export async function searchPrecosPncp(filters: PrecoSearchFilters): Promise<PrecoPncpRow[]> {
  if (!filters.query || filters.query.trim().length < 3) return []
  const supabase = createClient()
  const { data, error } = await supabase.rpc('search_precos_pncp', {
    p_query: filters.query.trim(),
    p_uf: filters.uf ?? null,
    p_modalidade: filters.modalidade ?? null,
    p_date_from: filters.dateFrom ?? null,
    p_date_to: filters.dateTo ?? null,
    p_limit: filters.limit ?? 50,
  })
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    itemId: r.item_id as string,
    descricao: r.descricao as string,
    quantidade: (r.quantidade as number | null) ?? null,
    unidadeMedida: (r.unidade_medida as string | null) ?? null,
    valorUnitario: Number(r.valor_unitario_estimado),
    valorTotal: (r.valor_total_estimado as number | null) ?? null,
    categoria: (r.categoria as string | null) ?? null,
    orgaoCnpj: (r.orgao_cnpj as string | null) ?? null,
    orgaoNome: r.orgao_nome as string,
    orgaoEsfera: (r.orgao_esfera as string | null) ?? null,
    modalidadeNome: (r.modalidade_nome as string | null) ?? null,
    dataPublicacao: (r.data_publicacao as string | null) ?? null,
    anoCompra: (r.ano_compra as number | null) ?? null,
    pncpId: r.pncp_id as string,
    linkPncp: (r.link_pncp as string | null) ?? null,
    valorHomologado: (r.tender_valor_homologado as number | null) ?? null,
  }))
}

export async function getPrecoStats(filters: PrecoSearchFilters): Promise<PrecoStats | null> {
  if (!filters.query || filters.query.trim().length < 3) return null
  const supabase = createClient()
  const { data, error } = await supabase.rpc('precos_pncp_stats', {
    p_query: filters.query.trim(),
    p_uf: filters.uf ?? null,
    p_modalidade: filters.modalidade ?? null,
    p_date_from: filters.dateFrom ?? null,
    p_date_to: filters.dateTo ?? null,
  })
  if (error || !data) return null
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  if (!r) return null
  return {
    n: Number(r.n ?? 0),
    media: Number(r.media ?? 0),
    mediana: Number(r.mediana ?? 0),
    minimo: Number(r.minimo ?? 0),
    maximo: Number(r.maximo ?? 0),
    desvioPadrao: Number(r.desvio_padrao ?? 0),
    cv: Number(r.cv ?? 0),
    complianceTcu1875: Boolean(r.compliance_tcu_1875),
  }
}

export async function addPrecoToCesta(
  processoId: string,
  itemDescricao: string,
  pncpItemId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('add_preco_pesquisa_from_pncp', {
    p_processo_id: processoId,
    p_item_descricao: itemDescricao,
    p_pncp_item_id: pncpItemId,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data as string }
}

export async function addMultiplePrecosToCesta(
  processoId: string,
  itemDescricao: string,
  pncpItemIds: string[],
): Promise<{ added: number; errors: string[] }> {
  const errors: string[] = []
  let added = 0
  for (const id of pncpItemIds) {
    const res = await addPrecoToCesta(processoId, itemDescricao, id)
    if (res.ok) added++
    else errors.push(res.error)
  }
  return { added, errors }
}

export interface PrecoTrendPoint {
  mes: string
  n: number
  media: number
  mediana: number
  minimo: number
  maximo: number
}

export async function getPrecoTrend(filters: PrecoSearchFilters & { meses?: number }): Promise<PrecoTrendPoint[]> {
  if (!filters.query || filters.query.trim().length < 3) return []
  const supabase = createClient()
  const { data, error } = await supabase.rpc('precos_pncp_trend', {
    p_query: filters.query.trim(),
    p_uf: filters.uf ?? null,
    p_modalidade: filters.modalidade ?? null,
    p_date_from: filters.dateFrom ?? null,
    p_date_to: filters.dateTo ?? null,
    p_meses: filters.meses ?? 24,
  })
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    mes: r.mes as string,
    n: Number(r.n ?? 0),
    media: Number(r.media ?? 0),
    mediana: Number(r.mediana ?? 0),
    minimo: Number(r.minimo ?? 0),
    maximo: Number(r.maximo ?? 0),
  }))
}


export interface CatalogoPncpRow {
  descricao: string
  unidadeMedida: string | null
  categoria: string | null
  nContratacoes: number
  mediaUnitaria: number
  medianaUnitaria: number
  ultimaContratacao: string | null
}

export async function searchCatalogoPncp(query: string | null, limit = 100): Promise<CatalogoPncpRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('search_catalogo_pncp', {
    p_query: query && query.trim().length > 0 ? query.trim() : null,
    p_limit: limit,
  })
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    descricao: r.descricao as string,
    unidadeMedida: (r.unidade_medida as string | null) ?? null,
    categoria: (r.categoria as string | null) ?? null,
    nContratacoes: Number(r.n_contratacoes ?? 0),
    mediaUnitaria: Number(r.media_unitaria ?? 0),
    medianaUnitaria: Number(r.mediana_unitaria ?? 0),
    ultimaContratacao: (r.ultima_contratacao as string | null) ?? null,
  }))
}
