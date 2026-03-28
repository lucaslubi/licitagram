import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import pino from 'pino'

// ─── Config ─────────────────────────────────────────────────────────────────
const logger = pino({ name: 'pncp-results-worker', level: process.env.LOG_LEVEL || 'info' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PNCP_BASE = 'https://pncp.gov.br/api/pncp/v1'
const RATE_LIMIT_MS = 500 // 2 req/sec
const BATCH_SIZE = 50
const RUN_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

// ─── Helpers ────────────────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractCnpjAnoSequencial(tender: {
  orgao_cnpj?: string
  ano_compra?: number | string
  sequencial_compra?: string
  numero_compra?: string
  link_pncp?: string
}) {
  // Try to extract from link_pncp if direct fields are missing
  if (tender.orgao_cnpj && tender.ano_compra && (tender.sequencial_compra || tender.numero_compra)) {
    return {
      cnpj: tender.orgao_cnpj.replace(/\D/g, ''),
      ano: String(tender.ano_compra),
      sequencial: tender.sequencial_compra || tender.numero_compra || '',
    }
  }

  // Fallback: parse from link_pncp
  if (tender.link_pncp) {
    const match = tender.link_pncp.match(/orgaos\/(\d+)\/compras\/(\d+)\/(\d+)/)
    if (match) {
      return { cnpj: match[1], ano: match[2], sequencial: match[3] }
    }
  }

  return null
}

// ─── Main Logic ─────────────────────────────────────────────────────────────
async function fetchResults(cnpj: string, ano: string, sequencial: string) {
  const url = `${PNCP_BASE}/orgaos/${cnpj}/compras/${ano}/${sequencial}/resultados`
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    if (res.status === 404) return [] // no results yet
    throw new Error(`PNCP API ${res.status}: ${res.statusText}`)
  }

  return res.json()
}

async function processTender(tender: { id: string; orgao_cnpj?: string; ano_compra?: number | string; sequencial_compra?: string; numero_compra?: string; link_pncp?: string }) {
  const parsed = extractCnpjAnoSequencial(tender)
  if (!parsed) {
    logger.warn({ tenderId: tender.id }, 'Could not extract CNPJ/ano/sequencial from tender')
    return
  }

  const { cnpj, ano, sequencial } = parsed

  try {
    const results = await fetchResults(cnpj, ano, sequencial)

    if (!Array.isArray(results) || results.length === 0) {
      // Mark as imported even if empty (no results available yet)
      await supabase
        .from('tenders')
        .update({ resultado_importado: true, resultado_checked_at: new Date().toISOString() })
        .eq('id', tender.id)
      return
    }

    // Save each fornecedor to competitors table
    const competitorRows = results.map((r: Record<string, unknown>) => ({
      tender_id: tender.id,
      cnpj: String(r.niFornecedor || '').replace(/\D/g, ''),
      razao_social: r.nomeRazaoSocialFornecedor || r.razaoSocial || null,
      valor_proposta: r.valorTotalProposta ?? r.valorProposta ?? null,
      is_winner: r.indicadorSubcontratacao === false && r.situacaoCompraItemResultadoNome === 'Adjudicado'
        || r.resultadoCompraIndicador === true
        || false,
      tipo_fornecedor: r.tipoPessoaFornecedorNome || null,
      porte: r.porteFornecedorNome || null,
      data_resultado: r.dataResultado || null,
      raw_data: r,
    }))

    // Upsert competitors (avoid duplicates)
    for (const row of competitorRows) {
      if (!row.cnpj) continue
      const { error } = await supabase
        .from('competitors')
        .upsert(row, { onConflict: 'tender_id,cnpj' })

      if (error) {
        logger.error({ error, tenderId: tender.id, cnpj: row.cnpj }, 'Failed to upsert competitor')
      }
    }

    // Mark tender as imported
    await supabase
      .from('tenders')
      .update({ resultado_importado: true, resultado_checked_at: new Date().toISOString() })
      .eq('id', tender.id)

    logger.info({ tenderId: tender.id, count: competitorRows.length }, 'Imported results')
  } catch (err) {
    logger.error({ err, tenderId: tender.id }, 'Error fetching PNCP results')
  }
}

async function run() {
  logger.info('Starting PNCP results import cycle')

  let offset = 0
  let processed = 0

  while (true) {
    const { data: tenders, error } = await supabase
      .from('tenders')
      .select('id, orgao_cnpj, ano_compra, sequencial_compra, numero_compra, link_pncp')
      .or('resultado_importado.is.null,resultado_importado.eq.false')
      .order('created_at', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) {
      logger.error({ error }, 'Failed to query tenders')
      break
    }

    if (!tenders || tenders.length === 0) break

    for (const tender of tenders) {
      await processTender(tender)
      await sleep(RATE_LIMIT_MS)
    }

    processed += tenders.length
    offset += BATCH_SIZE

    if (tenders.length < BATCH_SIZE) break
  }

  logger.info({ processed }, 'PNCP results import cycle complete')
}

// ─── Entry Point ────────────────────────────────────────────────────────────
async function main() {
  logger.info('PNCP Results Worker started')
  await run()
  setInterval(run, RUN_INTERVAL_MS)
}

main().catch(err => {
  logger.fatal({ err }, 'PNCP Results Worker crashed')
  process.exit(1)
})
