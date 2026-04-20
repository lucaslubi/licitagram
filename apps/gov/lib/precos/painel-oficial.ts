'use server'

import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
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

export async function addPainelToCesta(
  processoId: string,
  itemDescricao: string,
  painelId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('add_preco_pesquisa_from_painel', {
    p_processo_id: processoId,
    p_item_descricao: itemDescricao,
    p_painel_id: painelId,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data as string }
}

export async function addMultiplePainelToCesta(
  processoId: string,
  itemDescricao: string,
  painelIds: string[],
): Promise<{ added: number; errors: string[] }> {
  const errors: string[] = []
  let added = 0
  for (const id of painelIds) {
    const res = await addPainelToCesta(processoId, itemDescricao, id)
    if (res.ok) added++
    else errors.push(res.error)
  }
  return { added, errors }
}

// ─── UASG + Órgãos Oficiais (SIASG/SIORG) ─────────────────────────────────

export interface UasgRow {
  codigo: string
  nome: string
  cnpj: string | null
  orgaoCnpj: string | null
  orgaoNome: string | null
  orgaoSuperiorNome: string | null
  uf: string | null
  municipio: string | null
  usoSisg: boolean
  similaridade: number
}

export async function buscarUasg(params: {
  query?: string | null
  codigo?: string | null
  orgaoCnpj?: string | null
  uf?: string | null
  limit?: number
}): Promise<UasgRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('buscar_uasg', {
    p_query: params.query ?? null,
    p_codigo: params.codigo ?? null,
    p_orgao_cnpj: params.orgaoCnpj ?? null,
    p_uf: params.uf ?? null,
    p_limit: params.limit ?? 30,
  })
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    codigo: r.codigo as string,
    nome: r.nome as string,
    cnpj: (r.cnpj as string | null) ?? null,
    orgaoCnpj: (r.orgao_cnpj as string | null) ?? null,
    orgaoNome: (r.orgao_nome as string | null) ?? null,
    orgaoSuperiorNome: (r.orgao_superior_nome as string | null) ?? null,
    uf: (r.uf as string | null) ?? null,
    municipio: (r.municipio as string | null) ?? null,
    usoSisg: Boolean(r.uso_sisg),
    similaridade: Number(r.similaridade ?? 0),
  }))
}

export interface OrgaoOficialRow {
  cnpj: string
  razaoSocial: string
  sigla: string | null
  esfera: string | null
  poder: string | null
  orgaoSuperiorNome: string | null
  uf: string | null
  municipio: string | null
  similaridade: number
}

export async function buscarOrgaoOficial(params: {
  query?: string | null
  cnpj?: string | null
  esfera?: string | null
  uf?: string | null
  limit?: number
}): Promise<OrgaoOficialRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('buscar_orgao_oficial', {
    p_query: params.query ?? null,
    p_cnpj: params.cnpj ?? null,
    p_esfera: params.esfera ?? null,
    p_uf: params.uf ?? null,
    p_limit: params.limit ?? 30,
  })
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    cnpj: r.cnpj as string,
    razaoSocial: r.razao_social as string,
    sigla: (r.sigla as string | null) ?? null,
    esfera: (r.esfera as string | null) ?? null,
    poder: (r.poder as string | null) ?? null,
    orgaoSuperiorNome: (r.orgao_superior_nome as string | null) ?? null,
    uf: (r.uf as string | null) ?? null,
    municipio: (r.municipio as string | null) ?? null,
    similaridade: Number(r.similaridade ?? 0),
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

// ─── On-demand sync do Painel Oficial ─────────────────────────────────────
/**
 * Quando o usuário busca por um CATMAT/CATSER e não há dados no banco,
 * chamamos a API oficial do Compras.gov.br em tempo real, ingerimos via
 * RPC idempotente `ingest_painel_preco` (dedup por hash) e devolvemos os
 * dados fresh.
 *
 * Fecha o gap prometido pela UI: "O sync sob demanda é acionado
 * automaticamente pelo worker" — antes não acontecia, hoje acontece.
 *
 * Só faz sync se veio código específico — a API externa exige
 * codigoItemCatalogo e retorna 404 sem ele.
 */
interface RawPainelApiRow {
  idCompra?: string
  descricaoItem?: string
  codigoItemCatalogo?: number
  siglaUnidadeMedida?: string
  siglaUnidadeFornecimento?: string
  quantidade?: number
  precoUnitario?: number
  niFornecedor?: string
  nomeFornecedor?: string
  codigoUasg?: string
  nomeUasg?: string
  municipio?: string
  estado?: string
  modalidade?: number
  forma?: string
  criterioJulgamento?: string
  dataResultadoCompra?: string
  anoCompra?: number
}

const COMPRAS_API_BASE = 'https://dadosabertos.compras.gov.br'

function getAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente')
  }
  return createSupabaseAdmin(url, serviceKey, { auth: { persistSession: false } })
}

export async function syncPainelOnDemand(params: {
  tipo: 'M' | 'S'
  codigo: string
}): Promise<{ synced: number; attempted: number; error?: string }> {
  const { tipo, codigo } = params
  const clean = codigo.trim()
  if (!clean || !/^\d+$/.test(clean)) {
    return { synced: 0, attempted: 0, error: 'Código CATMAT/CATSER inválido' }
  }

  const endpoint = tipo === 'M' ? '1_consultarMaterial' : '3_consultarServico'
  const url = `${COMPRAS_API_BASE}/modulo-pesquisa-preco/${endpoint}?pagina=1&tamanhoPagina=500&codigoItemCatalogo=${clean}`

  let rows: RawPainelApiRow[] = []
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'licitagram-gov/1.0' },
      signal: AbortSignal.timeout(45_000),
      next: { revalidate: 0 }, // sempre fresh
    })
    if (res.status === 404) return { synced: 0, attempted: 0 }
    if (!res.ok) {
      return { synced: 0, attempted: 0, error: `API Compras.gov retornou HTTP ${res.status}` }
    }
    const data = (await res.json()) as { resultado?: RawPainelApiRow[] }
    rows = data.resultado ?? []
  } catch (e) {
    return {
      synced: 0,
      attempted: 0,
      error: `Falha ao buscar na fonte oficial: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  if (rows.length === 0) return { synced: 0, attempted: 0 }

  const admin = getAdminClient()
  const fonteUrl = `https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/${endpoint}?codigoItemCatalogo=${clean}`
  let synced = 0
  let attempted = 0

  for (const r of rows) {
    if (!r.precoUnitario || r.precoUnitario <= 0) continue
    attempted++
    const payload = {
      tipo_item: tipo,
      codigo_item: clean,
      descricao: r.descricaoItem ?? '',
      unidade_medida: r.siglaUnidadeMedida ?? r.siglaUnidadeFornecimento ?? null,
      orgao_cnpj: null,
      orgao_nome: r.nomeUasg ?? null,
      uasg_codigo: r.codigoUasg ?? null,
      uasg_nome: r.nomeUasg ?? null,
      modalidade: r.modalidade != null ? String(r.modalidade) : null,
      numero_compra: r.idCompra ?? null,
      ano_compra: r.anoCompra ?? null,
      data_homologacao: r.dataResultadoCompra ?? null,
      quantidade: r.quantidade ?? null,
      valor_unitario: r.precoUnitario,
      valor_total: (r.quantidade ?? 0) * r.precoUnitario,
      fornecedor_cnpj: r.niFornecedor ?? null,
      fornecedor_nome: r.nomeFornecedor ?? null,
      fonte_url: fonteUrl,
      metadados: {
        municipio: r.municipio,
        estado: r.estado,
        forma: r.forma,
        criterio: r.criterioJulgamento,
      },
    }
    const { error } = await admin.rpc('ingest_painel_preco', { p_data: payload })
    if (!error) synced++
    // Errors por duplicação de hash são silenciosos (OK — dedup esperado)
  }

  return { synced, attempted }
}
