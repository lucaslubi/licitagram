/**
 * Worker entrypoint: SCRAPING pool
 *
 * Registers only I/O-bound workers that call external APIs (PNCP, comprasgov, BrasilAPI).
 * Run alongside worker-matching.ts for independent scaling.
 *
 * Usage:
 *   pm2 start ecosystem.config.js --only worker-scraping
 *   # or directly:
 *   node --max-old-space-size=1024 dist/worker-scraping.js
 */
import 'dotenv/config'
import { logger } from './lib/logger'
import { db as supabase } from './lib/db'
import { formatDatePNCP } from './scrapers/pncp-client'
import { ALL_SCRAPING_MODALITIES } from '@licitagram/shared'

// ─── Workers (scraping / extraction / enrichment) ───────────────────────────
import { scrapingWorker } from './processors/scraping.processor'
import { extractionWorker } from './processors/extraction.processor'
import { comprasgovScrapingWorker } from './processors/comprasgov-scraping.processor'
import { resultsScrapingWorker } from './processors/results-scraping.processor'
import { arpScrapingWorker } from './processors/comprasgov-arp.processor'
import { legadoScrapingWorker } from './processors/comprasgov-legado.processor'
import { documentExpiryWorker } from './processors/document-expiry.processor'
import { fornecedorEnrichmentWorker } from './processors/fornecedor-enrichment.processor'
import { contactEnrichmentWorker } from './processors/contact-enrichment.processor'

// ─── Queues (for scheduling) ────────────────────────────────────────────────
import { scrapingQueue } from './queues/scraping.queue'
import { extractionQueue } from './queues/extraction.queue'
import { comprasgovScrapingQueue } from './queues/comprasgov-scraping.queue'
import { resultsScrapingQueue } from './queues/results-scraping.queue'
import { arpScrapingQueue } from './queues/comprasgov-arp.queue'
import { legadoScrapingQueue } from './queues/comprasgov-legado.queue'
import { documentExpiryQueue } from './queues/document-expiry.queue'
import { fornecedorEnrichmentQueue } from './queues/fornecedor-enrichment.queue'

const POOL_NAME = 'scraping'

const allWorkers = [
  scrapingWorker, extractionWorker, comprasgovScrapingWorker,
  resultsScrapingWorker, arpScrapingWorker, legadoScrapingWorker,
  documentExpiryWorker, fornecedorEnrichmentWorker, contactEnrichmentWorker,
]

async function setupScrapingJobs() {
  const today = formatDatePNCP(new Date())

  // PNCP scraping every 4h (all modalidades)
  for (const modalidadeId of ALL_SCRAPING_MODALITIES) {
    await scrapingQueue.add(
      `scrape-mod-${modalidadeId}`,
      { modalidadeId, dataInicial: today, dataFinal: today, pagina: 1 },
      { repeat: { every: 4 * 60 * 60 * 1000 }, jobId: `scrape-mod-${modalidadeId}-repeat` },
    )
  }

  // PNCP SP+MG every 6h
  for (const uf of ['SP', 'MG']) {
    for (const modalidadeId of ALL_SCRAPING_MODALITIES) {
      await scrapingQueue.add(
        `scrape-uf-${uf}-mod-${modalidadeId}`,
        { modalidadeId, dataInicial: today, dataFinal: today, pagina: 1, uf },
        { repeat: { every: 6 * 60 * 60 * 1000 }, jobId: `scrape-uf-${uf}-mod-${modalidadeId}-repeat` },
      )
    }
  }

  // dadosabertos.compras.gov.br every 4h
  await comprasgovScrapingQueue.add(
    'comprasgov-scrape', { pagina: 1 },
    { repeat: { every: 4 * 60 * 60 * 1000 }, jobId: 'comprasgov-scrape-repeat' },
  )

  // Results scraping every 24h
  await resultsScrapingQueue.add(
    'results-scrape', { batch: 0 },
    { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: 'results-scrape-repeat' },
  )

  // ARP every 12h
  await arpScrapingQueue.add(
    'arp-scrape', { pagina: 1 },
    { repeat: { every: 12 * 60 * 60 * 1000 }, jobId: 'arp-scrape-repeat' },
  )

  // Legacy pregoes every 24h
  await legadoScrapingQueue.add(
    'legado-scrape', { pagina: 1 },
    { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: 'legado-scrape-repeat' },
  )

  // Document expiry weekly
  await documentExpiryQueue.add(
    'document-expiry-check', { checkAll: true },
    { repeat: { every: 7 * 24 * 60 * 60 * 1000 }, jobId: 'document-expiry-repeat' },
  )

  // Fornecedor enrichment every 24h
  await fornecedorEnrichmentQueue.add(
    'fornecedor-enrich', { batch: 0 },
    { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: 'fornecedor-enrichment-repeat' },
  )

  logger.info({ pool: POOL_NAME }, 'Repeatable scraping jobs scheduled')

  // ─── Immediate startup scrapes ──────────────────────────────────────────
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const startDate = formatDatePNCP(thirtyDaysAgo)

  for (const modalidadeId of ALL_SCRAPING_MODALITIES) {
    await scrapingQueue.add(`scrape-initial-mod-${modalidadeId}`, {
      modalidadeId, dataInicial: startDate, dataFinal: today, pagina: 1,
    })
  }

  await comprasgovScrapingQueue.add('comprasgov-initial', { pagina: 1 })
  await arpScrapingQueue.add('arp-initial', { pagina: 1 })
  await legadoScrapingQueue.add('legado-initial', { pagina: 1 })

  for (const uf of ['SP', 'MG']) {
    for (const modalidadeId of ALL_SCRAPING_MODALITIES) {
      await scrapingQueue.add(`scrape-initial-uf-${uf}-mod-${modalidadeId}`, {
        modalidadeId, dataInicial: startDate, dataFinal: today, pagina: 1, uf,
      })
    }
  }

  // Re-queue extraction for tenders stuck in 'new'
  const { data: pendingTenders } = await supabase
    .from('tenders').select('id').eq('status', 'new').limit(500)

  if (pendingTenders && pendingTenders.length > 0) {
    for (const tender of pendingTenders) {
      await extractionQueue.add(`re-extract-${tender.id}`, { tenderId: tender.id }, {
        jobId: `re-extract-${tender.id}`,
      })
    }
    logger.info({ count: pendingTenders.length, pool: POOL_NAME }, 'Re-queued pending tenders')
  }

  logger.info({ pool: POOL_NAME }, 'Initial scraping jobs queued')
}

async function main() {
  logger.info({ pool: POOL_NAME }, 'Starting scraping worker pool...')
  await setupScrapingJobs()

  // ─── Memory pressure monitoring ─────────────────────────────────────────
  const HEAP_LIMIT = 800 * 1024 * 1024
  setInterval(async () => {
    const { heapUsed } = process.memoryUsage()
    if (heapUsed > HEAP_LIMIT) {
      logger.warn({ heapUsedMB: Math.round(heapUsed / 1024 / 1024), pool: POOL_NAME }, 'Memory pressure — pausing workers')
      await Promise.allSettled(allWorkers.map(w => w.pause()))
      if (global.gc) global.gc()
      await new Promise(r => setTimeout(r, 10_000))
      await Promise.allSettled(allWorkers.map(w => w.resume()))
      logger.info({ heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), pool: POOL_NAME }, 'Workers resumed')
    }
  }, 30_000)

  logger.info({ pool: POOL_NAME, workers: allWorkers.length }, 'Scraping pool running')
}

async function gracefulShutdown(signal: string) {
  logger.info({ signal, pool: POOL_NAME }, 'Graceful shutdown...')
  const timeout = setTimeout(() => { process.exit(1) }, 15_000)
  timeout.unref()
  await Promise.allSettled(allWorkers.map(w => w.close()))
  clearTimeout(timeout)
  logger.info({ pool: POOL_NAME }, 'All workers closed')
  process.exit(0)
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

main().catch(err => {
  logger.error({ err, pool: POOL_NAME }, 'Failed to start scraping pool')
  process.exit(1)
})
