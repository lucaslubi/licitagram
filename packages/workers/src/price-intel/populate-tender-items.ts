/**
 * PRICE INTELLIGENCE: Populate tender_items from PNCP API
 *
 * This is a STANDALONE script — does NOT touch any existing worker or queue.
 * Run via: node dist/price-intel/populate-tender-items.js
 *
 * Fetches item-level data (descricao, quantidade, unidade, valor unitario)
 * for tenders that have valor_homologado but no items yet.
 * Also populates price_history with winning prices per item.
 *
 * Rate limited: 500ms between PNCP API calls.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { fetchContratacaoItens } from '../scrapers/pncp-client'
import { logger } from '../lib/logger'

const log = logger.child({ module: 'price-intel-items' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
)

const BATCH_SIZE = 50
const DELAY_BETWEEN_REQUESTS = 600 // ms
const MAX_TENDERS_PER_RUN = 500 // limit per execution to avoid overload

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  log.info('Starting tender items population from PNCP API...')

  // Find tenders with valor_homologado that have NO items yet
  // These are the ones that would benefit most from item-level data
  const { data: tenders, error } = await supabase
    .from('tenders')
    .select('id, pncp_id, orgao_cnpj, objeto')
    .not('valor_homologado', 'is', null)
    .not('pncp_id', 'is', null)
    .order('data_encerramento', { ascending: false })
    .limit(MAX_TENDERS_PER_RUN)

  if (error) {
    log.error({ error }, 'Failed to fetch tenders')
    process.exit(1)
  }

  if (!tenders || tenders.length === 0) {
    log.info('No tenders need items population')
    process.exit(0)
  }

  // Filter out tenders that already have items
  const tenderIds = tenders.map(t => t.id)
  const { data: existingItems } = await supabase
    .from('tender_items')
    .select('tender_id')
    .in('tender_id', tenderIds)

  const hasItems = new Set((existingItems || []).map(i => i.tender_id))
  const needsItems = tenders.filter(t => !hasItems.has(t.id))

  log.info({
    total: tenders.length,
    alreadyHaveItems: hasItems.size,
    needItems: needsItems.length,
  }, 'Tenders analysis')

  let processed = 0
  let itemsInserted = 0
  let priceHistoryInserted = 0
  let failed = 0

  for (const tender of needsItems) {
    try {
      // Parse pncp_id: format is "cnpj-ano-sequencial"
      const pncpId = tender.pncp_id as string
      const parts = pncpId.split('-')
      if (parts.length < 3) {
        log.warn({ pncpId }, 'Invalid pncp_id format, skipping')
        continue
      }

      const cnpj = parts[0]
      const ano = parseInt(parts[1], 10)
      const sequencial = parseInt(parts[2], 10)

      if (!cnpj || isNaN(ano) || isNaN(sequencial)) {
        log.warn({ pncpId }, 'Could not parse pncp_id, skipping')
        continue
      }

      // Fetch items from PNCP API
      const items = await fetchContratacaoItens(cnpj, ano, sequencial)

      if (items.length === 0) {
        // No items returned — some tenders don't have item-level data
        processed++
        await sleep(DELAY_BETWEEN_REQUESTS)
        continue
      }

      // Insert tender_items
      const itemRows = items.map((item: Record<string, unknown>) => ({
        tender_id: tender.id,
        numero_item: item.numeroItem as number || null,
        descricao: (item.descricao as string || item.materialOuServico as string || 'N/I').slice(0, 2000),
        quantidade: item.quantidadeSolicitada as number || item.quantidade as number || null,
        unidade_medida: item.unidadeMedida as string || null,
        valor_unitario_estimado: item.valorUnitarioEstimado as number || null,
        valor_total_estimado: item.valorTotal as number || item.valorTotalEstimado as number || null,
        situacao_id: item.situacaoCompraItemId as number || null,
        situacao_nome: item.situacaoCompraItemNome as string || null,
        categoria_nome: item.tipoBeneficio as string || item.categoriaNome as string || null,
        criterio_julgamento_nome: item.criterioJulgamentoNome as string || null,
      }))

      // Batch insert items
      for (let i = 0; i < itemRows.length; i += BATCH_SIZE) {
        const batch = itemRows.slice(i, i + BATCH_SIZE)
        const { error: insertError } = await supabase
          .from('tender_items')
          .upsert(batch, { onConflict: 'tender_id,numero_item', ignoreDuplicates: true })

        if (insertError) {
          // If unique constraint doesn't exist for upsert, try regular insert
          const { error: insertError2 } = await supabase
            .from('tender_items')
            .insert(batch)

          if (insertError2 && !insertError2.message?.includes('duplicate')) {
            log.warn({ tenderId: tender.id, error: insertError2.message }, 'Failed to insert items batch')
          }
        }
        itemsInserted += batch.length
      }

      // Also populate price_history for items that have winning prices
      const winningItems = items.filter((item: Record<string, unknown>) => {
        const resultado = item.resultadoItem || item.situacaoCompraItemNome
        return resultado && String(resultado).toLowerCase().includes('homologad')
      })

      for (const item of winningItems) {
        const valorUnitario = item.valorUnitarioHomologado as number || item.valorUnitarioEstimado as number
        const valorTotal = item.valorTotalHomologado as number || item.valorTotalEstimado as number

        if (!valorUnitario && !valorTotal) continue

        const { error: phError } = await supabase
          .from('price_history')
          .insert({
            tender_id: tender.id,
            tender_item_number: item.numeroItem as number || null,
            cnpj_vencedor: item.cnpjVencedor as string || null,
            nome_vencedor: item.nomeVencedor as string || null,
            valor_unitario_vencido: valorUnitario || null,
            valor_total_vencido: valorTotal || null,
            data_homologacao: item.dataHomologacao as string || null,
            marca: item.marca as string || null,
            fabricante: item.fabricante as string || null,
          })

        if (!phError) {
          priceHistoryInserted++
        }
      }

      processed++

      if (processed % 50 === 0) {
        log.info({
          processed,
          itemsInserted,
          priceHistoryInserted,
          failed,
          remaining: needsItems.length - processed,
        }, 'Progress update')
      }

      await sleep(DELAY_BETWEEN_REQUESTS)
    } catch (err) {
      failed++
      log.error({
        tenderId: tender.id,
        pncpId: tender.pncp_id,
        error: err instanceof Error ? err.message : String(err),
      }, 'Failed to process tender items')
      await sleep(DELAY_BETWEEN_REQUESTS * 2) // Extra delay on error
    }
  }

  log.info({
    processed,
    itemsInserted,
    priceHistoryInserted,
    failed,
  }, 'Tender items population complete')

  process.exit(0)
}

main().catch(err => {
  log.error({ err: err.message }, 'Fatal error in populate-tender-items')
  process.exit(1)
})
