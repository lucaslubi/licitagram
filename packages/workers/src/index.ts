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
// BEC-SP scraper DISABLED — BEC migrated to compras.sp.gov.br; old ASP.NET pages no longer work.
// SP procurement data flows through PNCP (national portal) with uf='SP' filter.
// import { becSpScrapingWorker } from './processors/bec-sp-scraping.processor'
import { resultsScrapingWorker } from './processors/results-scraping.processor'
import { documentExpiryWorker } from './processors/document-expiry.processor'
import { fornecedorEnrichmentWorker } from './processors/fornecedor-enrichment.processor'
import { arpScrapingWorker } from './processors/comprasgov-arp.processor'
import { legadoScrapingWorker } from './processors/comprasgov-legado.processor'
// Portal MG scraper DISABLED — compras.mg.gov.br has WAF blocking non-browser requests.
// MG procurement data flows through PNCP (national portal) with uf='MG' filter.
// import { mgScrapingWorker } from './processors/compras-mg.processor'
import { aiTriageWorker } from './processors/ai-triage.processor'
import { semanticMatchingWorker } from './processors/semantic-matching.processor'
import { hotAlertsWorker } from './processors/hot-alerts.processor'

const allWorkers = [
  scrapingWorker, extractionWorker, matchingWorker, notificationWorker,
  pendingNotificationsWorker, comprasgovScrapingWorker,
  resultsScrapingWorker, documentExpiryWorker, fornecedorEnrichmentWorker,
  arpScrapingWorker, legadoScrapingWorker, aiTriageWorker,
  semanticMatchingWorker,
  hotAlertsWorker,
]
import { pendingNotificationsQueue } from './queues/pending-notifications.queue'
import { comprasgovScrapingQueue } from './queues/comprasgov-scraping.queue'
import { resultsScrapingQueue } from './queues/results-scraping.queue'
import { documentExpiryQueue } from './queues/document-expiry.queue'
import { fornecedorEnrichmentQueue } from './queues/fornecedor-enrichment.queue'
import { arpScrapingQueue } from './queues/comprasgov-arp.queue'
import { legadoScrapingQueue } from './queues/comprasgov-legado.queue'
import { hotAlertsQueue } from './queues/hot-alerts.queue'
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

  // Schedule pending notifications check every 5 minutes
  await pendingNotificationsQueue.add(
    'check-pending',
    {},
    {
      repeat: { every: 5 * 60 * 1000 },
      jobId: 'pending-notifications-5min',
    },
  )
  logger.info('Pending notifications job scheduled (every 5 min)')

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

  // Schedule PNCP scraping for SP and MG specifically (every 6h)
  // BEC-SP and Portal MG scrapers are broken (site migrated / WAF blocks).
  // Instead, we use PNCP's native UF filter to ensure comprehensive coverage.
  for (const uf of ['SP', 'MG']) {
    for (const modalidadeId of ALL_SCRAPING_MODALITIES) {
      await scrapingQueue.add(
        `scrape-uf-${uf}-mod-${modalidadeId}`,
        {
          modalidadeId,
          dataInicial: today,
          dataFinal: today,
          pagina: 1,
          uf,
        },
        {
          repeat: { every: 6 * 60 * 60 * 1000 },
          jobId: `scrape-uf-${uf}-mod-${modalidadeId}-repeat`,
        },
      )
    }
  }
  logger.info('PNCP SP+MG UF-specific scraping jobs scheduled (every 6h)')

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

  // Schedule hot alerts scan every 3 hours — surfaces best opportunities ASAP
  await hotAlertsQueue.add(
    'hot-daily',
    {},
    {
      repeat: { every: 3 * 60 * 60 * 1000 },
      jobId: 'hot-scan-3h-repeat',
    },
  )
  logger.info('Hot alerts scan scheduled (every 3h)')

  // Schedule urgency check every hour
  await hotAlertsQueue.add(
    'urgency-check',
    {},
    {
      repeat: { every: 60 * 60 * 1000 },
      jobId: 'urgency-check-repeat',
    },
  )
  logger.info('Urgency check job scheduled (every 1h)')

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

  // Trigger immediate PNCP SP+MG scrape (last 30 days)
  for (const uf of ['SP', 'MG']) {
    for (const modalidadeId of ALL_SCRAPING_MODALITIES) {
      await scrapingQueue.add(
        `scrape-initial-uf-${uf}-mod-${modalidadeId}`,
        {
          modalidadeId,
          dataInicial: startDate,
          dataFinal: today,
          pagina: 1,
          uf,
        },
      )
    }
  }
  logger.info('Initial PNCP SP+MG UF-specific scraping jobs queued (last 30 days)')

  // Trigger immediate ARP and legacy scrape
  await arpScrapingQueue.add('arp-initial', { pagina: 1 })
  logger.info('Initial ARP scraping job queued')

  await legadoScrapingQueue.add('legado-initial', { pagina: 1 })
  logger.info('Initial legacy pregoes scraping job queued')

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

  // Run CNAE classification backfill on startup (non-blocking)
  // Most classifications now resolve locally (instant), AI only for ambiguous cases
  batchClassifyTenders(500).catch(err => {
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

  // Listen for Redis pub/sub events from the web app
  try {
    const IORedis = (await import('ioredis')).default
    const subscriber = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    })
    await subscriber.subscribe('licitagram:rematch-done', 'licitagram:company-saved')
    subscriber.on('message', async (channel, message) => {
      try {
        if (channel === 'licitagram:rematch-done') {
          const { companyId, matchCount } = JSON.parse(message)
          logger.info({ companyId, matchCount }, 'Rematch done — triggering immediate notification check')
          await pendingNotificationsQueue.add(
            `rematch-notify-${companyId}`,
            {},
            { jobId: `rematch-notify-${companyId}-${Date.now()}` },
          )
        } else if (channel === 'licitagram:company-saved') {
          const { companyId } = JSON.parse(message)
          logger.info({ companyId }, 'Company saved — generating terms + keyword matching + AI triage')

          // 0. Auto-generate comprehensive search terms using AI
          try {
            const { generateCompanyTerms } = await import('./processors/ai-triage.processor')
            const newTerms = await generateCompanyTerms(companyId)
            if (newTerms.length > 0) {
              logger.info({ companyId, count: newTerms.length }, 'AI generated new search terms for company')
            }
          } catch (err) {
            logger.warn({ companyId, err }, 'Term generation failed (non-critical)')
          }

          // 1. Run keyword matching sweep for all tenders against this company
          try {
            await runKeywordMatchingSweep()
          } catch (err) {
            logger.error({ companyId, err }, 'Background keyword matching failed')
          }

          // 2. Enqueue AI triage for all keyword matches of this company
          try {
            const { aiTriageQueue } = await import('./queues/ai-triage.queue')
            const PAGE = 1000
            let offset = 0
            const allMatchIds: string[] = []
            while (true) {
              const { data: page } = await supabase
                .from('matches')
                .select('id')
                .eq('company_id', companyId)
                .eq('match_source', 'keyword')
                .range(offset, offset + PAGE - 1)
              if (!page || page.length === 0) break
              allMatchIds.push(...page.map(m => m.id))
              if (page.length < PAGE) break
              offset += PAGE
            }

            if (allMatchIds.length > 0) {
              const CHUNK = 50
              for (let i = 0; i < allMatchIds.length; i += CHUNK) {
                const chunk = allMatchIds.slice(i, i + CHUNK)
                await aiTriageQueue.add(
                  `company-save-triage-${companyId}-${i}`,
                  { companyId, matchIds: chunk },
                  { jobId: `company-save-triage-${companyId}-${i}-${Date.now()}` },
                )
              }
              logger.info({ companyId, matchCount: allMatchIds.length }, 'Enqueued AI triage for company matches')
            }
          } catch (err) {
            logger.error({ companyId, err }, 'Failed to enqueue AI triage after company save')
          }
        }
      } catch (err) {
        logger.error({ err, channel }, 'Failed to process Redis event')
      }
    })
    logger.info('Listening for Redis events (rematch-done, company-saved)')
  } catch (err) {
    logger.warn({ err }, 'Failed to setup Redis event listener (non-critical)')
  }

  // Schedule CNAE classification backfill every 15 minutes
  // Now hybrid: ~80% resolve locally (instant), ~20% use Gemini fallback
  // Much lower API consumption while maintaining accuracy
  setInterval(async () => {
    try {
      await batchClassifyTenders(500)
    } catch (err) {
      logger.error({ err }, 'CNAE classification backfill failed')
    }
  }, 15 * 60 * 1000)

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

  // Semantic matching: embed tenders + profile companies + run sweep (non-blocking)
  if (process.env.JINA_API_KEY || process.env.OPENAI_API_KEY) {
    // Initial batch: embed unembedded tenders and profile companies
    Promise.all([
      import('./processors/company-profiler').then(m => m.batchEmbedTenders(500)),
      import('./processors/company-profiler').then(m => m.profileAllCompanies()),
    ]).then(() => {
      // After embeddings are ready, run semantic matching sweep
      return import('./processors/semantic-matcher').then(m => m.runSemanticMatchingSweep())
    }).catch(err => {
      logger.error({ err }, 'Semantic matching initialization failed')
    })

    // Schedule semantic matching sweep every 6 hours
    setInterval(async () => {
      try {
        const { batchEmbedTenders, profileAllCompanies } = await import('./processors/company-profiler')
        await batchEmbedTenders(500)
        await profileAllCompanies()
        const { runSemanticMatchingSweep } = await import('./processors/semantic-matcher')
        await runSemanticMatchingSweep()
      } catch (err) {
        logger.error({ err }, 'Semantic matching sweep failed')
      }
    }, 6 * 60 * 60 * 1000)

    logger.info('Semantic matching engine enabled (JINA/OpenAI embeddings)')
  } else {
    logger.info('Semantic matching disabled — set JINA_API_KEY or OPENAI_API_KEY to enable')
  }

  logger.info('All workers running. CNAE-first + semantic matching engine active. Press Ctrl+C to stop.')
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
