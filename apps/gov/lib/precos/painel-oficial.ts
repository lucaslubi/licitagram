'use server'

import { createClient } from '@/lib/supabase/server'

export interface PainelOficialRow {
  id: string
  tipoItem: 'M' | 'S'
  codigoItem: string
  descricao: string
  unidadeMedida: string | null
  orgaoNome: string | null
  uasgNome: string | null
  modalidade: string | null
  dataHomologacao: string | null
  valorUnitario: number
  fornecedorNome: string | null
  fonteUrl: string | null
}

export interface PainelOficialStats {
  n: number
  media: number
  mediana: number
  minimo: number
  maximo: number
  cv: number
  complianceTcu1875: boolean
}

export interface PainelFilters {
  query?: string | null
  codigo?: string | null
  tipo?: 'M' | 'S' | null
  modalidade?: string | null
  meses?: number
  limit?: number
}

export async function searchPainelOficial(filters: PainelFilters): Promise<PainelOficialRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('buscar_preco_painel_oficial', {
    p_query: filters.query ?? null,
    p_codigo: filters.codigo ?? null,
    p_tipo: filters.tipo ?? null,
    p_modalidade: filters.modalidade ?? null,
    p_meses: filters.meses ?? 12,
    p_limit: filters.limit ?? 50,
  })
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    tipoItem: r.tipo_item as 'M' | 'S',
    codigoItem: r.codigo_item as string,
    descricao: r.descricao as string,
    unidadeMedida: (r.unidade_medida as string | null) ?? null,
    orgaoNome: (r.orgao_nome as string | null) ?? null,
    uasgNome: (r.uasg_nome as string | null) ?? null,
    modalidade: (r.modalidade as string | null) ?? null,
    dataHomologacao: (r.data_homologacao as string | null) ?? null,
    valorUnitario: Number(r.valor_unitario),
    fornecedorNome: (r.fornecedor_nome as string | null) ?? null,
    fonteUrl: (r.fonte_url as string | null) ?? null,
  }))
}

export async function getPainelStats(filters: PainelFilters): Promise<PainelOficialStats | null> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('stats_painel_oficial', {
    p_query: filters.query ?? null,
    p_codigo: filters.codigo ?? null,
    p_tipo: filters.tipo ?? null,
    p_meses: filters.meses ?? 12,
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
    cv: Number(r.cv ?? 0),
    complianceTcu1875: Boolean(r.compliance_tcu_1875),
  }
}

export interface CatalogoOficialRow {
  tipo: 'M' | 'S'
  codigo: string
  descricao: string
  unidadeMedida: string | null
  categoria: string | null
}

export async function searchCatmatCatser(
  query: string,
  tipo?: 'M' | 'S',
  limit = 30,
): Promise<CatalogoOficialRow[]> {
  if (!query || query.trim().length < 2) return []
  const supabase = createClient()
  const { data, error } = await supabase.rpc('search_catmat_catser', {
    p_query: query.trim(),
    p_tipo: tipo ?? null,
    p_limit: limit,
  })
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    tipo: r.tipo as 'M' | 'S',
    codigo: r.codigo as string,
    descricao: r.descricao as string,
    unidadeMedida: (r.unidade_medida as string | null) ?? null,
    categoria: (r.categoria as string | null) ?? null,
  }))
}

export interface FornecedorRow {
  cnpj: string
  razaoSocial: string
  uf: string | null
  municipio: string | null
  porte: string | null
  cnaePrimario: string | null
  situacaoCadastral: string | null
  possuiSancao: boolean
  sancoesVigentes: number
}

export async function recomendarFornecedores(params: {
  cnae?: string | null
  uf?: string | null
  query?: string | null
  limit?: number
}): Promise<FornecedorRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('recomendar_fornecedores', {
    p_cnae: params.cnae ?? null,
    p_uf: params.uf ?? null,
    p_query: params.query ?? null,
    p_limit: params.limit ?? 20,
  })
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    cnpj: r.cnpj as string,
    razaoSocial: r.razao_social as string,
    uf: (r.uf as string | null) ?? null,
    municipio: (r.municipio as string | null) ?? null,
    porte: (r.porte as string | null) ?? null,
    cnaePrimario: (r.cnae_primario as string | null) ?? null,
    situacaoCadastral: (r.situacao_cadastral as string | null) ?? null,
    possuiSancao: Boolean(r.possui_sancao),
    sancoesVigentes: Number(r.sancoes_vigentes ?? 0),
  }))
}

export async function verificarSancao(cnpj: string): Promise<{
  temSancaoVigente: boolean
  total: number
  tipos: string[]
}> {
  const clean = cnpj.replace(/\D/g, '')
  if (clean.length !== 14) return { temSancaoVigente: false, total: 0, tipos: [] }
  const supabase = createClient()
  const { data, error } = await supabase.rpc('verificar_sancao_fornecedor', { p_cnpj: clean })
  if (error || !data) return { temSancaoVigente: false, total: 0, tipos: [] }
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  return {
    temSancaoVigente: Boolean(r?.tem_sancao_vigente),
    total: Number(r?.total ?? 0),
    tipos: (r?.tipos as string[] | null) ?? [],
  }
}
