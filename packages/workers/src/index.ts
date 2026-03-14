import 'dotenv/config'
import { logger } from './lib/logger'
import { scrapingQueue } from './queues/scraping.queue'
import { extractionQueue } from './queues/extraction.queue'
import { runKeywordMatchingSweep } from './processors/keyword-matcher'
import { batchClassifyTenders } from './ai/cnae-classifier'
import { formatDatePNCP, fetchDocumentos } from './scrapers/pncp-client'
import { supabase } from './lib/supabase'
import { ALL_SCRAPING_MODALITIES } from '@licitagram/shared'
import { scrapingWorker } from './processors/scraping.processor'
import { extractionWorker } from './processors/extraction.processor'
import { matchingWorker } from './processors/matching.processor'
import { notificationWorker } from './processors/notification.processor'
import { pendingNotificationsWorker } from './processors/pending-notifications.processor'
import { comprasgovScrapingWorker } from './processors/comprasgov-scraping.processor'
import { becSpScrapingWorker } from './processors/bec-sp-scraping.processor'
import { resultsScrapingWorker } from './processors/results-scraping.processor'
import { documentExpiryWorker } from './processors/document-expiry.processor'
import { fornecedorEnrichmentWorker } from './processors/fornecedor-enrichment.processor'
import { arpScrapingWorker } from './processors/comprasgov-arp.processor'
import { legadoScrapingWorker } from './processors/comprasgov-legado.processor'
import { mgScrapingWorker } from './processors/compras-mg.processor'

const allWorkers = [
  scrapingWorker, extractionWorker, matchingWorker, notificationWorker,
  pendingNotificationsWorker, comprasgovScrapingWorker, becSpScrapingWorker,
  resultsScrapingWorker, documentExpiryWorker, fornecedorEnrichmentWorker,
  arpScrapingWorker, legadoScrapingWorker, mgScrapingWorker,
]
import { pendingNotificationsQueue } from './queues/pending-notifications.queue'
import { comprasgovScrapingQueue } from './queues/comprasgov-scraping.queue'
import { becSpScrapingQueue } from './queues/bec-sp-scraping.queue'
import { resultsScrapingQueue } from './queues/results-scraping.queue'
import { documentExpiryQueue } from './queues/document-expiry.queue'
import { fornecedorEnrichmentQueue } from './queues/fornecedor-enrichment.queue'
import { arpScrapingQueue } from './queues/comprasgov-arp.queue'
import { legadoScrapingQueue } from './queues/comprasgov-legado.queue'
import { mgScrapingQueue } from './queues/compras-mg.queue'
import { startBot } from './telegram/bot'

async function setupRepeatableJobs() {
  const today = formatDatePNCP(new Date())

  for (const modalidadeId of ALL_SCRAPING_MODALITIES) {
    await scrapingQueue.add(
      `scrape-mod-${modalidadeId}`,
      {
        modalidadeId,
        dataInicial: today,
        dataFinal: today,
        pagina: 1,
      },
      {
        repeat: { every: 4 * 60 * 60 * 1000 },
        jobId: `scrape-mod-${modalidadeId}-repeat`,
      },
    )
  }

  logger.info('Repeatable PNCP scraping jobs scheduled (every 4h)')

  // Schedule pending notifications check every 30 minutes
  await pendingNotificationsQueue.add(
    'check-pending',
    {},
    {
      repeat: { every: 30 * 60 * 1000 },
      jobId: 'pending-notifications-repeat',
    },
  )
  logger.info('Pending notifications job scheduled (every 30 min)')

  // Schedule dadosabertos.compras.gov.br scraping every 4 hours
  await comprasgovScrapingQueue.add(
    'comprasgov-scrape',
    { pagina: 1 },
    {
      repeat: { every: 4 * 60 * 60 * 1000 },
      jobId: 'comprasgov-scrape-repeat',
    },
  )
  logger.info('dadosabertos.compras.gov.br scraping job scheduled (every 4h)')

  // Schedule BEC SP scraping every 4 hours (3 tipos)
  for (const tipo of ['pregao', 'dispensa', 'oferta_compra'] as const) {
    await becSpScrapingQueue.add(
      `bec-sp-${tipo}`,
      { tipo },
      {
        repeat: { every: 4 * 60 * 60 * 1000 },
        jobId: `bec-sp-${tipo}-repeat`,
      },
    )
  }
  logger.info('BEC SP scraping jobs scheduled (every 4h)')

  // Schedule PNCP results scraping (competitive intelligence) every 24 hours
  await resultsScrapingQueue.add(
    'results-scrape',
    { batch: 0 },
    {
      repeat: { every: 24 * 60 * 60 * 1000 },
      jobId: 'results-scrape-repeat',
    },
  )
  logger.info('PNCP results scraping job scheduled (every 24h)')

  // Schedule document expiry check weekly (every 7 days)
  await documentExpiryQueue.add(
    'document-expiry-check',
    { checkAll: true },
    {
      repeat: { every: 7 * 24 * 60 * 60 * 1000 },
      jobId: 'document-expiry-repeat',
    },
  )
  logger.info('Document expiry check scheduled (weekly)')

  // Schedule fornecedor enrichment every 48 hours (enrich competitors with CNAE, porte, etc.)
  await fornecedorEnrichmentQueue.add(
    'fornecedor-enrich',
    { batch: 0 },
    {
      repeat: { every: 48 * 60 * 60 * 1000 },
      jobId: 'fornecedor-enrichment-repeat',
    },
  )
  logger.info('Fornecedor enrichment job scheduled (every 48h)')

  // Schedule ARP (Atas de Registro de Preço) scraping every 12 hours
  await arpScrapingQueue.add(
    'arp-scrape',
    { pagina: 1 },
    {
      repeat: { every: 12 * 60 * 60 * 1000 },
      jobId: 'arp-scrape-repeat',
    },
  )
  logger.info('ARP scraping job scheduled (every 12h)')

  // Schedule legacy pregões (Lei 8.666) scraping every 24 hours
  await legadoScrapingQueue.add(
    'legado-scrape',
    { pagina: 1 },
    {
      repeat: { every: 24 * 60 * 60 * 1000 },
      jobId: 'legado-scrape-repeat',
    },
  )
  logger.info('Legacy pregoes scraping job scheduled (every 24h)')

  // Schedule Portal MG scraping every 6 hours
  await mgScrapingQueue.add(
    'mg-scrape',
    { tipo: 'all' },
    {
      repeat: { every: 6 * 60 * 60 * 1000 },
      jobId: 'mg-scrape-repeat',
    },
  )
  logger.info('Portal MG scraping job scheduled (every 6h)')

  // Trigger immediate scrape on startup (last 30 days for comprehensive coverage)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const startDate = formatDatePNCP(thirtyDaysAgo)

  for (const modalidadeId of ALL_SCRAPING_MODALITIES) {
    await scrapingQueue.add(
      `scrape-initial-mod-${modalidadeId}`,
      {
        modalidadeId,
        dataInicial: startDate,
        dataFinal: today,
        pagina: 1,
      },
    )
  }

  logger.info('Initial PNCP scraping jobs queued (last 30 days)')

  // Trigger immediate dadosabertos scrape (all modalidades, last 30 days)
  await comprasgovScrapingQueue.add('comprasgov-initial', { pagina: 1 })
  logger.info('Initial dadosabertos.compras.gov.br scraping job queued')

  // Trigger immediate BEC SP scrape
  for (const tipo of ['pregao', 'dispensa', 'oferta_compra'] as const) {
    await becSpScrapingQueue.add(`bec-sp-initial-${tipo}`, { tipo })
  }
  logger.info('Initial BEC SP scraping jobs queued')

  // Trigger immediate ARP and legacy scrape
  await arpScrapingQueue.add('arp-initial', { pagina: 1 })
  logger.info('Initial ARP scraping job queued')

  await legadoScrapingQueue.add('legado-initial', { pagina: 1 })
  logger.info('Initial legacy pregoes scraping job queued')

  // Trigger immediate Portal MG scrape
  await mgScrapingQueue.add('mg-initial', { tipo: 'all' })
  logger.info('Initial Portal MG scraping job queued')

  // Re-queue extraction for tenders stuck in 'new' status
  const { data: pendingTenders } = await supabase
    .from('tenders')
    .select('id')
    .eq('status', 'new')
    .limit(500)

  if (pendingTenders && pendingTenders.length > 0) {
    for (const tender of pendingTenders) {
      await extractionQueue.add(`re-extract-${tender.id}`, { tenderId: tender.id }, {
        jobId: `re-extract-${tender.id}`,
      })
    }
    logger.info({ count: pendingTenders.length }, 'Re-queued pending tenders for extraction')
  }

  // Run CNAE classification backfill on startup (non-blocking, aggressive)
  // Classifies 2000 unclassified tenders immediately on boot
  batchClassifyTenders(2000).catch(err => {
    logger.error({ err }, 'CNAE classification backfill failed on startup')
  })

  // Run keyword matching sweep on startup (non-blocking)
  // Now processes ALL tenders (classifies on-the-fly when needed)
  runKeywordMatchingSweep().catch(err => {
    logger.error({ err }, 'Keyword matching sweep failed on startup')
  })
}

/**
 * One-time backfill: fetch PNCP documents for comprasgov tenders that have none.
 * These tenders were scraped before document fetching was added to the comprasgov processor.
 * Runs in batches with rate limiting to avoid overwhelming the PNCP API.
 */
async function backfillComprasgovDocuments() {
  // Find comprasgov tenders with no documents
  const { data: tenders, error } = await supabase
    .from('tenders')
    .select('id, orgao_cnpj, ano_compra, sequencial_compra')
    .eq('source', 'comprasgov')
    .not('orgao_cnpj', 'is', null)
    .not('ano_compra', 'is', null)
    .not('sequencial_compra', 'is', null)
    .limit(200) // Process in batches

  if (error || !tenders || tenders.length === 0) {
    logger.info('No comprasgov tenders to backfill')
    return
  }

  // Filter to only those missing documents
  const tenderIds = tenders.map(t => t.id)
  const { data: existingDocs } = await supabase
    .from('tender_documents')
    .select('tender_id')
    .in('tender_id', tenderIds)

  const tendersWithDocs = new Set((existingDocs || []).map(d => d.tender_id))
  const tendersToBackfill = tenders.filter(t => !tendersWithDocs.has(t.id))

  if (tendersToBackfill.length === 0) {
    logger.info('All comprasgov tenders already have documents (or none available)')
    return
  }

  logger.info({ count: tendersToBackfill.length }, 'Backfilling PNCP documents for comprasgov tenders')

  let fetched = 0
  let failed = 0
  for (const tender of tendersToBackfill) {
    try {
      const cnpj = String(tender.orgao_cnpj).replace(/\D/g, '')
      const ano = Number(tender.ano_compra)
      const seq = Number(tender.sequencial_compra)

      if (!cnpj || !ano || !seq) continue

      const docs = await fetchDocumentos(cnpj, ano, seq)

      for (const doc of docs) {
        await supabase.from('tender_documents').insert({
          tender_id: tender.id,
          titulo: doc.titulo,
          tipo: doc.tipo,
          url: doc.url,
          status: 'pending',
        })
      }

      if (docs.length > 0) {
        fetched++
        // Re-queue extraction to process the new PDFs
        await extractionQueue.add(`backfill-extract-${tender.id}`, { tenderId: tender.id })
      }
    } catch (err) {
      failed++
      // Don't log every failure — PNCP might not have docs for every tender
    }
  }

  logger.info({ fetched, failed, total: tendersToBackfill.length }, 'Comprasgov document backfill complete')
}

async function main() {
  logger.info('Licitagram workers starting...')
  await setupRepeatableJobs()
  await startBot()

  // Schedule CNAE classification backfill every 5 minutes (turbo)
  // Batch 1000 × concurrency 10 × 12/hour = up to 12,000/hour
  // 32K backlog → classified in ~3 hours
  setInterval(async () => {
    try {
      await batchClassifyTenders(1000)
    } catch (err) {
      logger.error({ err }, 'CNAE classification backfill failed')
    }
  }, 5 * 60 * 1000)

  // Schedule CNAE-first keyword matching sweep every 4 hours
  setInterval(async () => {
    try {
      await runKeywordMatchingSweep()
    } catch (err) {
      logger.error({ err }, 'Keyword matching sweep failed')
    }
  }, 4 * 60 * 60 * 1000)

  // Schedule monthly match counter reset (runs daily at 00:05, resets if past month boundary)
  scheduleMonthlyReset()

  // Backfill documents for comprasgov tenders (one-time, non-blocking)
  backfillComprasgovDocuments().catch(err => {
    logger.error({ err }, 'Comprasgov document backfill failed')
  })

  logger.info('All workers running. CNAE-first matching engine active. Press Ctrl+C to stop.')
}

/**
 * Schedule daily check for monthly counter resets.
 * Runs every 24h — the SQL function only resets rows where matches_reset_at < current month.
 */
function scheduleMonthlyReset() {
  const runReset = async () => {
    try {
      const { data, error } = await supabase.rpc('reset_monthly_counters')
      if (error) {
        logger.error({ error }, 'Monthly counter reset failed')
      } else {
        const count = typeof data === 'number' ? data : 0
        if (count > 0) {
          logger.info({ count }, 'Monthly counters reset')
        }
      }
    } catch (err) {
      logger.error({ err }, 'Monthly counter reset exception')
    }
  }

  // Run once on startup (catches any missed resets)
  runReset()

  // Then every 24 hours
  setInterval(runReset, 24 * 60 * 60 * 1000)
  logger.info('Monthly counter reset scheduled (daily check)')
}

async function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Graceful shutdown starting...')
  try {
    await Promise.allSettled(allWorkers.map((w) => w.close()))
    logger.info('All workers closed')
  } catch (err) {
    logger.error({ err }, 'Error during worker shutdown')
  }
  process.exit(0)
}

process.on('SIGINT', () => { gracefulShutdown('SIGINT') })
process.on('SIGTERM', () => { gracefulShutdown('SIGTERM') })

main().catch((err) => {
  logger.error({ err }, 'Failed to start workers')
  process.exit(1)
})
