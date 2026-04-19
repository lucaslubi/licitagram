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

// ─── Main ────────────────────────────────────────────────────────────────
async function main() {
  const jobs: Array<[string, () => Promise<number>]> = [
    ['catmat', syncCatmat],
    ['catser', syncCatser],
    ['uasg', syncUasg],
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
