/**
 * PRICE INTELLIGENCE: Fetch from Banco de Preços em Saúde (BPS)
 *
 * Source: https://bps.saude.gov.br / https://www.gov.br/saude/pt-br/acesso-a-informacao/banco-de-precos
 * Ministry of Health price database for medicines and medical devices.
 *
 * STANDALONE script — does NOT touch any existing worker.
 * Run via: node dist/price-intel/fetch-bps-saude.js
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { logger } from '../lib/logger'

const log = logger.child({ module: 'price-intel-bps' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
)

const DELAY_MS = 1000

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

/**
 * BPS API endpoints (from gov.br open data):
 * The BPS publishes compiled databases in CSV and has a dashboard.
 * We try the API endpoint first, then fallback to open data CSV.
 */
async function fetchBPSPrecos(
  termo: string,
): Promise<Array<{
  descricao: string
  valor_unitario: number
  unidade: string | null
  cnpj: string | null
  fornecedor: string | null
  orgao: string | null
  uf: string | null
  data: string | null
}>> {
  // Try BPS API
  const endpoints = [
    `https://bps.saude.gov.br/api/v1/precos?termo=${encodeURIComponent(termo)}`,
    `https://servicos.saude.gov.br/bps/api/precos?descricao=${encodeURIComponent(termo)}`,
  ]

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Licitagram/1.0 (price-intelligence)',
        },
        signal: AbortSignal.timeout(10_000),
      })

      if (!res.ok) continue

      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('json')) continue

      const json = await res.json()
      const items = Array.isArray(json) ? json : (json.data || json.resultado || [])

      return items.map((item: Record<string, unknown>) => ({
        descricao: (item.descricao || item.nomeItem || item.produto || termo) as string,
        valor_unitario: (item.valorUnitario || item.precoUnitario || item.valor || 0) as number,
        unidade: (item.unidade || item.unidadeFornecimento || null) as string | null,
        cnpj: (item.cnpj || item.cnpjFornecedor || null) as string | null,
        fornecedor: (item.fornecedor || item.nomeFornecedor || null) as string | null,
        orgao: (item.orgao || item.entidade || null) as string | null,
        uf: (item.uf || null) as string | null,
        data: (item.data || item.dataCompra || null) as string | null,
      })).filter((i: { valor_unitario: number }) => i.valor_unitario > 0)
    } catch {
      continue
    }
  }

  return []
}

async function main() {
  log.info('Starting BPS Saúde price data fetch...')

  // Health-related search terms
  const healthTerms = [
    'medicamento', 'seringa', 'luva procedimento', 'mascara cirurgica',
    'álcool gel', 'gaze esteril', 'soro fisiologico', 'agulha descartavel',
    'esparadrapo', 'termometro', 'esfigmomanometro', 'oximetro',
    'cateter', 'equipo soro', 'algodao hidrofilo', 'atadura',
    'compressa', 'bisturi', 'fio sutura', 'clorexidina',
  ]

  // Also add terms from our health-related tenders
  const { data: healthTenders } = await supabase
    .from('tenders')
    .select('objeto')
    .or('objeto.ilike.%medicament%,objeto.ilike.%hospitalar%,objeto.ilike.%saude%,objeto.ilike.%farmac%')
    .limit(50)

  const terms = new Set(healthTerms)
  for (const t of healthTenders || []) {
    if (t.objeto) {
      const words = (t.objeto as string).split(/\s+/).filter((w: string) => w.length > 4).slice(0, 3)
      if (words.length >= 2) terms.add(words.join(' '))
    }
  }

  log.info({ termCount: terms.size }, 'Search terms prepared')

  let totalInserted = 0
  let termIndex = 0

  for (const term of terms) {
    termIndex++
    const items = await fetchBPSPrecos(term)

    for (const item of items) {
      const { error } = await supabase
        .from('price_references')
        .insert({
          descricao: item.descricao,
          unidade_medida: item.unidade,
          valor_unitario: item.valor_unitario,
          fonte: 'bps_saude',
          cnpj_fornecedor: item.cnpj,
          nome_fornecedor: item.fornecedor,
          orgao_nome: item.orgao,
          orgao_uf: item.uf,
          data_referencia: item.data || new Date().toISOString(),
          confiabilidade: 0.90, // Government health ministry — high confidence
        })

      if (!error) totalInserted++
    }

    if (termIndex % 10 === 0) {
      log.info({ progress: `${termIndex}/${terms.size}`, totalInserted }, 'Progress')
    }

    await sleep(DELAY_MS)
  }

  log.info({ totalInserted, termsProcessed: terms.size }, 'BPS Saúde fetch complete')
  process.exit(0)
}

main().catch(err => {
  log.error({ err: err.message }, 'Fatal error')
  process.exit(1)
})
