#!/usr/bin/env tsx
/**
 * Sincroniza dados abertos oficiais do Compras.gov.br pro schema licitagov.
 *
 * Base da API oficial (validada): https://dadosabertos.compras.gov.br
 * Documentação Postman: https://documenter.getpostman.com/view/13166820/2sA3XJjPpR
 *
 * Endpoints sincronizados (bulk):
 *   - modulo-material/4_consultarItemMaterial      → licitagov.cat_catmat
 *   - modulo-servico/6_consultarItemServico        → licitagov.cat_catser
 *   - modulo-uasg/1_consultarUasg                  → licitagov.uasg_oficial
 *   - modulo-uasg/2_consultarOrgao                 → licitagov.orgaos_oficiais
 *   - modulo-pesquisa-preco/1_consultarMaterial    → on-demand (chamado pela UI/RAG)
 *   - modulo-contratacoes/1_consultarContratacoes_PNCP_14133 → on-demand
 *
 * Parametrização:
 *   tamanhoPagina mín 10, máx 500.
 *   Paginação: `pagina=N` (1-based).
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     pnpm tsx scripts/sync-compras-gov.ts [--only=catmat|catser|uasg|orgao|all] \
 *                                          [--limit=N] [--dry-run]
 */

import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']),
)
const ONLY = args.only as string | undefined
const LIMIT = args.limit ? Number(args.limit) : undefined
const DRY_RUN = args['dry-run'] === 'true'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('× SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatórios no env')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

const API_BASE = 'https://dadosabertos.compras.gov.br'
const PAGE_SIZE = 500

async function fetchJson<T>(url: string, attempt = 0): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'licitagram-gov-sync/1.0' },
      // @ts-expect-error Node 20+
      signal: AbortSignal.timeout(60_000),
    })
    if (res.status === 404) return null
    if (!res.ok) {
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        const backoff = 2 ** attempt * 2000
        await new Promise((r) => setTimeout(r, backoff))
        return fetchJson<T>(url, attempt + 1)
      }
      const body = await res.text().catch(() => '')
      console.warn(`  HTTP ${res.status}: ${body.slice(0, 120)}`)
      return null
    }
    return (await res.json()) as T
  } catch (e) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
      return fetchJson<T>(url, attempt + 1)
    }
    console.warn(`  fetch falhou: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

function sha256(obj: unknown): string {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex')
}

interface ApiPage<T> {
  resultado: T[]
  totalRegistros?: number
  totalPaginas?: number
  paginasRestantes?: number
}

async function paginateBatch<T, R>(
  urlFactory: (page: number) => string,
  transform: (row: T) => R | null,
  batchInsert: (batch: R[]) => Promise<void>,
  label: string,
): Promise<number> {
  let page = 1
  let total = 0
  while (true) {
    const data = await fetchJson<ApiPage<T>>(urlFactory(page))
    if (!data || !data.resultado?.length) break
    const batch: R[] = []
    for (const row of data.resultado) {
      const r = transform(row)
      if (r) batch.push(r)
    }
    if (batch.length > 0 && !DRY_RUN) {
      try {
        await batchInsert(batch)
      } catch (e) {
        console.warn(`\n  batch insert falhou: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    total += batch.length
    process.stdout.write(`  ${label} pag=${page} total=${total}/${data.totalRegistros ?? '?'}\r`)
    if (LIMIT && total >= LIMIT) break
    const remaining = data.paginasRestantes ?? Math.max(0, (data.totalPaginas ?? 1) - page)
    if (remaining <= 0) break
    page++
  }
  process.stdout.write('\n')
  return total
}

// ─── CATMAT ──────────────────────────────────────────────────────────────
interface RawCatmatItem {
  codigoItem?: number
  descricaoItem?: string
  nomePdm?: string
  codigoPdm?: number
  codigoClasse?: number
  nomeClasse?: string
  codigoGrupo?: number
  nomeGrupo?: string
  statusItem?: boolean
  itemSustenta?: boolean
  unidadeMedidaItem?: string
}

async function syncCatmat(): Promise<number> {
  console.log('→ CATMAT (Material)')
  const now = new Date().toISOString()
  return paginateBatch<RawCatmatItem, Record<string, unknown>>(
    (p) => `${API_BASE}/modulo-material/4_consultarItemMaterial?pagina=${p}&tamanhoPagina=${PAGE_SIZE}`,
    (m) => {
      const codigo = m.codigoItem ? String(m.codigoItem) : null
      if (!codigo) return null
      const descricao = m.descricaoItem?.trim() ?? ''
      return {
        codigo,
        descricao,
        nome: m.nomePdm ?? null,
        sustentavel: Boolean(m.itemSustenta),
        unidade_medida: m.unidadeMedidaItem ?? null,
        pdm_codigo: m.codigoPdm ? String(m.codigoPdm) : null,
        pdm_nome: m.nomePdm ?? null,
        classe_codigo: m.codigoClasse ? String(m.codigoClasse) : null,
        classe_nome: m.nomeClasse ?? null,
        grupo_codigo: m.codigoGrupo ? String(m.codigoGrupo) : null,
        grupo_nome: m.nomeGrupo ?? null,
        hash_conteudo: sha256({ codigo, descricao }),
        data_verificacao: now,
      }
    },
    async (batch) => {
      await supabase.schema('licitagov' as never).from('cat_catmat').upsert(batch as never, { onConflict: 'codigo' })
    },
    'catmat',
  )
}

// ─── CATSER ──────────────────────────────────────────────────────────────
interface RawCatserItem {
  codigoServico?: number
  nomeServico?: string
  descricaoServico?: string
  codigoClasse?: number
  nomeClasse?: string
  codigoGrupo?: number
  nomeGrupo?: string
  codigoSubclasse?: number
  nomeSubclasse?: string
  statusServico?: boolean
}

async function syncCatser(): Promise<number> {
  console.log('→ CATSER (Serviço)')
  const now = new Date().toISOString()
  return paginateBatch<RawCatserItem, Record<string, unknown>>(
    (p) => `${API_BASE}/modulo-servico/6_consultarItemServico?pagina=${p}&tamanhoPagina=${PAGE_SIZE}`,
    (s) => {
      const codigo = s.codigoServico ? String(s.codigoServico) : null
      if (!codigo) return null
      const descricao = s.descricaoServico?.trim() ?? s.nomeServico?.trim() ?? ''
      return {
        codigo,
        descricao,
        nome: s.nomeServico ?? null,
        classe_codigo: s.codigoClasse ? String(s.codigoClasse) : null,
        classe_nome: s.nomeClasse ?? null,
        grupo_codigo: s.codigoGrupo ? String(s.codigoGrupo) : null,
        grupo_nome: s.nomeGrupo ?? null,
        hash_conteudo: sha256({ codigo, descricao }),
        data_verificacao: now,
      }
    },
    async (batch) => {
      await supabase.schema('licitagov' as never).from('cat_catser').upsert(batch as never, { onConflict: 'codigo' })
    },
    'catser',
  )
}

// ─── UASG + Órgão ────────────────────────────────────────────────────────
interface RawUasg {
  codigoUasg?: number
  nomeUasg?: string
  siglaUf?: string
  municipioIbge?: number
  cnpj?: string
  orgaoSuperiorCnpj?: string
  orgaoVinculadoCnpj?: string
  usoSisg?: boolean
  statusUasg?: boolean
}

async function syncUasg(): Promise<number> {
  console.log('→ UASG (tabela licitagov.uasg_oficial ainda não existe — skip)')
  return 0
}

// ─── Painel de Preços (pesquisa-preco) ───────────────────────────────────
// Só retorna resultado quando filtra por codigoItemCatalogo específico.
// Estratégia: iterar pelos códigos mais usados em catalogo_normalizado
// (top N), + todos os códigos já registrados em processos do gov.
interface RawPainelRow {
  idCompra?: string
  idItemCompra?: number
  forma?: string
  modalidade?: number
  criterioJulgamento?: string
  numeroItemCompra?: number
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
  codigoOrgao?: number
  dataResultadoCompra?: string
  anoCompra?: number
}

async function fetchPainelForCode(tipo: 'M' | 'S', codigo: string): Promise<RawPainelRow[]> {
  const url = tipo === 'M'
    ? `${API_BASE}/modulo-pesquisa-preco/1_consultarMaterial?pagina=1&tamanhoPagina=${PAGE_SIZE}&codigoItemCatalogo=${codigo}`
    : `${API_BASE}/modulo-pesquisa-preco/3_consultarServico?pagina=1&tamanhoPagina=${PAGE_SIZE}&codigoItemCatalogo=${codigo}`
  const data = await fetchJson<ApiPage<RawPainelRow>>(url)
  return data?.resultado ?? []
}

/**
 * Sync do Painel de Preços: itera sobre os códigos CATMAT/CATSER mais
 * usados em processos do gov + os códigos em catalogo_normalizado.
 */
async function syncPainelPrecos(): Promise<number> {
  console.log('→ Painel de Preços (warmup dos códigos em uso)')
  // Coleta códigos únicos dos dois tipos
  const codigos: Array<{ tipo: 'M' | 'S'; codigo: string; descricao: string }> = []

  // Top N do catalogo_normalizado
  const { data: cat } = await supabase
    .schema('licitagov' as never)
    .from('catalogo_normalizado')
    .select('codigo_catmat, codigo_catser, descricao_oficial')
    .order('uso_count', { ascending: false })
    .limit(LIMIT ?? 200)
  for (const c of (cat ?? []) as Array<{ codigo_catmat: string | null; codigo_catser: string | null; descricao_oficial: string }>) {
    if (c.codigo_catmat) codigos.push({ tipo: 'M', codigo: c.codigo_catmat, descricao: c.descricao_oficial })
    else if (c.codigo_catser) codigos.push({ tipo: 'S', codigo: c.codigo_catser, descricao: c.descricao_oficial })
  }

  if (codigos.length === 0) {
    console.log('  nenhum código no catalogo_normalizado. Use `--only=painel` depois do 1º uso.')
    return 0
  }

  let total = 0
  for (const { tipo, codigo, descricao } of codigos) {
    const rows = await fetchPainelForCode(tipo, codigo)
    if (rows.length === 0) continue
    const batch = rows
      .filter((r) => r.precoUnitario && r.precoUnitario > 0)
      .map((r) => ({
        p_data: {
          tipo_item: tipo,
          codigo_item: codigo,
          descricao: r.descricaoItem ?? descricao,
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
          valor_total: (r.quantidade ?? 0) * (r.precoUnitario ?? 0),
          fornecedor_cnpj: r.niFornecedor ?? null,
          fornecedor_nome: r.nomeFornecedor ?? null,
          fonte_url: `https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/${tipo === 'M' ? '1_consultarMaterial' : '3_consultarServico'}?codigoItemCatalogo=${codigo}`,
          metadados: { municipio: r.municipio, estado: r.estado, forma: r.forma, criterio: r.criterioJulgamento },
        },
      }))
    if (DRY_RUN) { total += batch.length; continue }
    for (const item of batch) {
      try {
        await supabase.rpc('ingest_painel_preco', item as never)
        total++
      } catch { /* dedup via hash — ok */ }
    }
    process.stdout.write(`  painel codigo=${codigo} +${batch.length} total=${total}\n`)
  }
  return total
}

// ─── Main ────────────────────────────────────────────────────────────────
async function main() {
  const jobs: Array<[string, () => Promise<number>]> = [
    ['catmat', syncCatmat],
    ['catser', syncCatser],
    ['uasg', syncUasg],
    ['painel', syncPainelPrecos],
  ]
  const run = ONLY && ONLY !== 'all' ? jobs.filter(([n]) => n === ONLY) : jobs
  if (run.length === 0) {
    console.error(`× --only inválido. Use: ${jobs.map(([n]) => n).join(', ')} ou all`)
    process.exit(1)
  }
  const t0 = Date.now()
  for (const [name, fn] of run) {
    try {
      const n = await fn()
      console.log(`  ✓ ${name}: ${n} registros`)
    } catch (e) {
      console.error(`× ${name} falhou:`, e instanceof Error ? e.message : e)
    }
  }
  console.log(`Concluído em ${((Date.now() - t0) / 1000).toFixed(1)}s${DRY_RUN ? ' [DRY-RUN]' : ''}`)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
