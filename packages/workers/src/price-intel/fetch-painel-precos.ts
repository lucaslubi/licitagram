/**
 * PRICE INTELLIGENCE: Fetch from Painel de Preços do Governo Federal
 *
 * Source: https://paineldeprecos.planejamento.gov.br
 * Official government price benchmarking panel.
 *
 * STANDALONE script — does NOT touch any existing worker.
 * Run via: node dist/price-intel/fetch-painel-precos.js
 *
 * The Painel de Preços doesn't have a public REST API,
 * but has a data endpoint that returns JSON for search queries.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { logger } from '../lib/logger'

const log = logger.child({ module: 'price-intel-painel' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
)

const PAINEL_BASE = 'https://paineldeprecos.planejamento.gov.br'
const DELAY_MS = 1000

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

interface PainelPrecoItem {
  descricao?: string
  codigoCatmat?: string
  codigoCatser?: string
  valorUnitario?: number
  valorTotal?: number
  quantidade?: number
  unidadeFornecimento?: string
  cnpjFornecedor?: string
  nomeFornecedor?: string
  porteFornecedor?: string
  orgaoComprador?: string
  ufOrgao?: string
  modalidade?: string
  dataCompra?: string
}

/**
 * Try to fetch from Painel de Preços search endpoint.
 * The panel uses internal API calls that may not be publicly documented.
 */
async function fetchPainelPrecos(
  termo: string,
  pagina = 1,
): Promise<PainelPrecoItem[]> {
  // Try the known data endpoint patterns
  const endpoints = [
    `${PAINEL_BASE}/api/precos?termo=${encodeURIComponent(termo)}&pagina=${pagina}`,
    `${PAINEL_BASE}/analise/precos/consultarPrecos?descricao=${encodeURIComponent(termo)}&pagina=${pagina}`,
  ]

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; Licitagram/1.0)',
        },
        signal: AbortSignal.timeout(10_000),
      })

      if (!res.ok) continue

      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('json')) continue

      const json = await res.json()
      const items = Array.isArray(json) ? json : (json.data || json.resultado || json.itens || [])

      if (items.length > 0) {
        log.info({ url, count: items.length }, 'Painel de Preços data fetched')
        return items
      }
    } catch {
      continue
    }
  }

  return []
}

async function main() {
  log.info('Starting Painel de Preços data fetch...')

  // Get search terms from our existing items
  const { data: items } = await supabase
    .from('tender_items')
    .select('descricao')
    .not('descricao', 'is', null)
    .limit(200)

  const terms = new Set<string>()
  for (const item of items || []) {
    if (item.descricao) {
      const words = (item.descricao as string).split(/\s+/).filter((w: string) => w.length > 3).slice(0, 3)
      if (words.length >= 2) terms.add(words.join(' '))
    }
  }

  log.info({ termCount: terms.size }, 'Search terms prepared')

  let totalInserted = 0
  let termIndex = 0

  for (const term of terms) {
    termIndex++
    const items = await fetchPainelPrecos(term)

    for (const item of items) {
      if (!item.valorUnitario || item.valorUnitario <= 0) continue

      const { error } = await supabase
        .from('price_references')
        .insert({
          descricao: item.descricao || term,
          catmat_catser: item.codigoCatmat || item.codigoCatser || null,
          unidade_medida: item.unidadeFornecimento || null,
          quantidade: item.quantidade || null,
          valor_unitario: item.valorUnitario,
          valor_total: item.valorTotal || null,
          fonte: 'painel_precos',
          cnpj_fornecedor: item.cnpjFornecedor || null,
          nome_fornecedor: item.nomeFornecedor || null,
          porte_fornecedor: item.porteFornecedor || null,
          orgao_nome: item.orgaoComprador || null,
          orgao_uf: item.ufOrgao || null,
          modalidade: item.modalidade || null,
          data_referencia: item.dataCompra || new Date().toISOString(),
          confiabilidade: 0.95, // Government official source — high confidence
        })

      if (!error) totalInserted++
    }

    if (termIndex % 20 === 0) {
      log.info({ progress: `${termIndex}/${terms.size}`, totalInserted }, 'Progress')
    }

    await sleep(DELAY_MS)
  }

  log.info({ totalInserted, termsProcessed: terms.size }, 'Painel de Preços fetch complete')
  process.exit(0)
}

main().catch(err => {
  log.error({ err: err.message }, 'Fatal error')
  process.exit(1)
})
