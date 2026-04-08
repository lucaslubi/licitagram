import 'dotenv/config'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'
import { fetchContratacaoItens } from '../scrapers/pncp-client'

const PARALLEL = 10 // Process 10 tenders concurrently

async function processOneTender(tender: any): Promise<'success' | 'skip' | 'error'> {
  // Skip tenders without PNCP keys (comprasgov tenders without sequencial)
  if (!tender.ano_compra || !tender.sequencial_compra) return 'skip'

  try {
    const cnpj = String(tender.orgao_cnpj).replace(/\D/g, '')
    const items = await fetchContratacaoItens(cnpj, tender.ano_compra, tender.sequencial_compra)

    if (!items || items.length === 0) return 'skip'

    const itemRows = items.map((item: any) => ({
      tender_id: tender.id,
      numero_item: item.numeroItem,
      descricao: item.descricao,
      quantidade: item.quantidade,
      unidade_medida: item.unidadeMedida,
      valor_unitario_estimado: item.valorUnitarioEstimado,
      valor_total_estimado: item.valorTotalEstimado,
      situacao_id: item.situacaoItem,
      situacao_nome: item.situacaoItemNome,
      categoria_nome: item.itemCategoriaNome,
      criterio_julgamento_nome: item.criterioJulgamentoNome,
    }))

    const { error } = await supabase.from('tender_items').insert(itemRows)
    if (error) {
      logger.warn({ tenderId: tender.id, code: error.code }, 'Insert failed')
      return 'error'
    }
    return 'success'
  } catch {
    return 'error'
  }
}

async function backfillItems() {
  logger.info('🚀 Starting FAST parallel backfill (last 24h)...')

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Fetch only PNCP tenders (have ano_compra) from the last 24h
  const { data: allTenders, error } = await supabase
    .from('tenders')
    .select('id, orgao_cnpj, ano_compra, sequencial_compra')
    .gte('created_at', since)
    .not('ano_compra', 'is', null)
    .not('sequencial_compra', 'is', null)
    .order('created_at', { ascending: false })

  if (error || !allTenders?.length) {
    logger.info({ error }, 'No eligible tenders found')
    return
  }

  // Filter out those already with items
  const ids = allTenders.map((t: any) => t.id)
  const { data: existing } = await supabase
    .from('tender_items')
    .select('tender_id')
    .in('tender_id', ids)

  const done = new Set((existing || []).map((r: any) => r.tender_id))
  const toProcess = allTenders.filter((t: any) => !done.has(t.id))

  logger.info({ total: allTenders.length, alreadyDone: done.size, toProcess: toProcess.length }, 'Ready to backfill')

  let success = 0, skipped = 0, errors = 0
  const start = Date.now()

  // Process in parallel chunks
  for (let i = 0; i < toProcess.length; i += PARALLEL) {
    const chunk = toProcess.slice(i, i + PARALLEL)
    const results = await Promise.all(chunk.map(processOneTender))

    for (const r of results) {
      if (r === 'success') success++
      else if (r === 'skip') skipped++
      else errors++
    }

    // Progress log every 50 tenders
    if ((i + PARALLEL) % 50 === 0 || i + PARALLEL >= toProcess.length) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      logger.info({ processed: Math.min(i + PARALLEL, toProcess.length), total: toProcess.length, success, skipped, errors, elapsed: `${elapsed}s` }, 'Progress')
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  logger.info({ success, skipped, errors, elapsed: `${elapsed}s` }, '✅ Backfill complete!')
}

backfillItems().catch(err => {
  logger.error({ err }, 'Fatal error')
  process.exit(1)
})
