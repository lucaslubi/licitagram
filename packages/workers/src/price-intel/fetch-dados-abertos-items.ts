/**
 * PRICE INTELLIGENCE: Fetch item-level data from Dados Abertos Compras API
 *
 * Source: https://dadosabertos.compras.gov.br
 * This is the OFFICIAL open data API for federal procurement.
 * It has item-level details that PNCP may not expose.
 *
 * STANDALONE script — does NOT touch any existing worker.
 * Run via: node dist/price-intel/fetch-dados-abertos-items.js
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { logger } from '../lib/logger'

const log = logger.child({ module: 'price-intel-dados-abertos' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
)

const DADOS_ABERTOS_BASE = 'https://dadosabertos.compras.gov.br'
const DELAY_MS = 800 // Rate limit
const MAX_PAGES = 20

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

interface DadosAbertosItem {
  codigoItemCatalogo?: string // CATMAT/CATSER code
  descricaoItem?: string
  quantidadeHomologada?: number
  unidadeFornecimento?: string
  valorUnitarioHomologado?: number
  valorTotalHomologado?: number
  cnpjFornecedor?: string
  nomeRazaoSocialFornecedor?: string
  dataHomologacao?: string
  marcaFabricante?: string
  // ... other fields
}

/**
 * Fetch recent homologated items from Dados Abertos API
 * endpoint: /modulo-pesquisa-preco/1_consultarPrecos
 */
async function fetchPrecoPraticado(
  descricao: string,
  pagina = 1,
): Promise<{ items: DadosAbertosItem[]; hasMore: boolean }> {
  const url = `${DADOS_ABERTOS_BASE}/modulo-pesquisa-preco/1_consultarPrecos?termoPesquisa=${encodeURIComponent(descricao)}&pagina=${pagina}&tamanhoPagina=100`

  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Licitagram/1.0 (price-intelligence)',
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      // Try alternative endpoint
      return fetchComprasItens(descricao, pagina)
    }

    const json = await res.json()
    const items = Array.isArray(json) ? json : (json.data || json.resultado || [])

    return {
      items,
      hasMore: items.length >= 100,
    }
  } catch (err) {
    log.warn({ descricao, error: err instanceof Error ? err.message : String(err) }, 'Failed to fetch from Dados Abertos price endpoint')
    // Fallback to compras items endpoint
    return fetchComprasItens(descricao, pagina)
  }
}

/**
 * Alternative: fetch from contratações items endpoint
 */
async function fetchComprasItens(
  descricao: string,
  pagina = 1,
): Promise<{ items: DadosAbertosItem[]; hasMore: boolean }> {
  const url = `${DADOS_ABERTOS_BASE}/modulo-contratacoes/1_consultarItensContratacoes?termoPesquisa=${encodeURIComponent(descricao)}&pagina=${pagina}&tamanhoPagina=100`

  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Licitagram/1.0 (price-intelligence)',
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      log.warn({ status: res.status, descricao }, 'Dados Abertos items endpoint failed')
      return { items: [], hasMore: false }
    }

    const json = await res.json()
    const items = Array.isArray(json) ? json : (json.data || json.resultado || [])

    return {
      items,
      hasMore: items.length >= 100,
    }
  } catch (err) {
    log.warn({ descricao, error: err instanceof Error ? err.message : String(err) }, 'Failed to fetch compras items')
    return { items: [], hasMore: false }
  }
}

/**
 * Main: enrich price_history with data from Dados Abertos
 * Fetches for popular search terms and inserts unique records
 */
async function main() {
  log.info('Starting Dados Abertos price data fetch...')

  // Get popular search terms from tender objects (most searched items)
  const { data: popularItems } = await supabase
    .from('tender_items')
    .select('descricao')
    .not('descricao', 'is', null)
    .limit(100)

  // Also get top tender objects as search terms
  const { data: tenderTerms } = await supabase
    .from('tenders')
    .select('objeto')
    .not('valor_homologado', 'is', null)
    .order('data_encerramento', { ascending: false })
    .limit(50)

  // Combine and deduplicate search terms
  const terms = new Set<string>()
  for (const item of popularItems || []) {
    if (item.descricao) {
      // Extract key words (first 3-4 significant words)
      const words = item.descricao.split(/\s+/).filter(w => w.length > 3).slice(0, 3)
      if (words.length >= 2) terms.add(words.join(' '))
    }
  }
  for (const t of tenderTerms || []) {
    if (t.objeto) {
      const words = t.objeto.split(/\s+/).filter((w: string) => w.length > 3).slice(0, 3)
      if (words.length >= 2) terms.add(words.join(' '))
    }
  }

  log.info({ termCount: terms.size }, 'Search terms prepared')

  let totalInserted = 0
  let totalSkipped = 0
  let termIndex = 0

  for (const term of terms) {
    termIndex++
    log.info({ term, progress: `${termIndex}/${terms.size}` }, 'Fetching prices for term')

    let page = 1
    let hasMore = true

    while (hasMore && page <= MAX_PAGES) {
      const { items, hasMore: more } = await fetchPrecoPraticado(term, page)
      hasMore = more

      for (const item of items) {
        if (!item.valorUnitarioHomologado || item.valorUnitarioHomologado <= 0) continue

        // Try to find matching tender in our database
        // For now, insert as standalone price reference
        const { error } = await supabase
          .from('price_history')
          .insert({
            tender_id: null as unknown as string, // External reference — no local tender
            tender_item_number: null,
            cnpj_vencedor: item.cnpjFornecedor || null,
            nome_vencedor: item.nomeRazaoSocialFornecedor || null,
            valor_unitario_vencido: item.valorUnitarioHomologado,
            valor_total_vencido: item.valorTotalHomologado || null,
            data_homologacao: item.dataHomologacao || null,
            marca: item.marcaFabricante || null,
          })

        if (error) {
          if (error.message?.includes('not-null')) {
            totalSkipped++
          } else {
            log.warn({ error: error.message }, 'Failed to insert price record')
          }
        } else {
          totalInserted++
        }
      }

      page++
      await sleep(DELAY_MS)
    }

    await sleep(DELAY_MS)
  }

  log.info({ totalInserted, totalSkipped, termsProcessed: terms.size }, 'Dados Abertos fetch complete')
  process.exit(0)
}

main().catch(err => {
  log.error({ err: err.message }, 'Fatal error in fetch-dados-abertos-items')
  process.exit(1)
})
