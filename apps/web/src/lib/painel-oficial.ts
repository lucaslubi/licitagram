'use server'

import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

/**
 * Sync on-demand do Painel de Preços Oficial (Compras.gov.br) pro B2B.
 *
 * Quando usuário pesquisa um CATMAT/CATSER e não há dados no banco
 * (licitagov.painel_precos_oficial populado pelo Gov), consulta a API
 * oficial em tempo real e ingere via RPC idempotente. Mesma estratégia
 * do Gov (apps/gov/lib/precos/painel-oficial.ts).
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
      headers: { Accept: 'application/json', 'User-Agent': 'licitagram-b2b/1.0' },
      signal: AbortSignal.timeout(45_000),
      next: { revalidate: 0 },
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
  }

  return { synced, attempted }
}
