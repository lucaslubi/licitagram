import 'dotenv/config'
import { logger } from './lib/logger'
import { scrapingQueue } from './queues/scraping.queue'
import { extractionQueue } from './queues/extraction.queue'
import { runKeywordMatchingSweep, runKeywordMatchingForCompany } from './processors/keyword-matcher'
import { batchClassifyTenders } from './ai/cnae-classifier'
import { formatDatePNCP, fetchDocumentos } from './scrapers/pncp-client'
import { db as supabase } from './lib/db'
import { ALL_SCRAPING_MODALITIES } from '@licitagram/shared'
import type { Worker } from 'bullmq'

// ─── Worker Groups ────────────────────────────────────────────────────────
// Each group can run as a separate PM2 process for true parallelism.
// Usage: node dist/index.js --queues scraping  (runs only scraping workers)
//        node dist/index.js                    (runs ALL workers — backward compatible)

// Parse --queues argument BEFORE imports to avoid instantiating unused workers
const queuesArg = process.argv.find(a => a.startsWith('--queues='))?.split('=')[1]
  || (process.argv.indexOf('--queues') >= 0 ? process.argv[process.argv.indexOf('--queues') + 1] : null)

const ALL_GROUPS = ['scraping', 'extraction', 'matching', 'alerts', 'telegram', 'whatsapp', 'email', 'enrichment', 'notification', 'analysis', 'certidoes', 'pregao-chat']
const selectedGroups = queuesArg ? queuesArg.split(',').map(g => g.trim()) : ALL_GROUPS
const isFullMode = !queuesArg

// Lazy-load only the workers needed for this process (avoid instantiating unused BullMQ Workers)
async function loadWorkers(): Promise<Worker[]> {
  const workers: Worker[] = []

  if (isFullMode || selectedGroups.includes('scraping')) {
    const { scrapingWorker } = await import('./processors/scraping.processor')
    const { comprasgovScrapingWorker } = await import('./processors/comprasgov-scraping.processor')
    const { arpScrapingWorker } = await import('./processors/comprasgov-arp.processor')
    const { legadoScrapingWorker } = await import('./processors/comprasgov-legado.processor')
    const { resultsScrapingWorker } = await import('./processors/results-scraping.processor')
    workers.push(scrapingWorker, comprasgovScrapingWorker, arpScrapingWorker, legadoScrapingWorker, resultsScrapingWorker)
  }

  if (isFullMode || selectedGroups.includes('extraction')) {
    const { extractionWorker } = await import('./processors/extraction.processor')
    workers.push(extractionWorker)
  }

  if (isFullMode || selectedGroups.includes('matching')) {
    const { matchingWorker } = await import('./processors/matching.processor')
    const { aiTriageWorker } = await import('./processors/ai-triage.processor')
    const { semanticMatchingWorker } = await import('./processors/semantic-matching.processor')
    const { weeklyActionsWorker: weeklyActionsWorkerMatching } = await import('./processors/weekly-actions.processor')
    workers.push(matchingWorker, aiTriageWorker, semanticMatchingWorker, weeklyActionsWorkerMatching)
  }

  // Legacy 'notification' group loads everything (backward compatible)
  if (isFullMode || selectedGroups.includes('notification')) {
    const { notificationWorker } = await import('./processors/notification.processor')
    const { pendingNotificationsWorker } = await import('./processors/pending-notifications.processor')
    const { hotAlertsWorker } = await import('./processors/hot-alerts.processor')
    const { whatsappNotificationWorker } = await import('./processors/whatsapp-notification.processor')
    const { outcomeCheckWorker } = await import('./processors/outcome-check.processor')
    const { channelOnboardingWorker } = await import('./processors/channel-onboarding.processor')
    const { trialExpiryWorker: trialExpiryNotifWorker } = await import('./processors/trial-expiry.processor')
    workers.push(notificationWorker, pendingNotificationsWorker, hotAlertsWorker, whatsappNotificationWorker, outcomeCheckWorker, channelOnboardingWorker, trialExpiryNotifWorker)
  }

  // Split notification groups for parallel mode
  if (selectedGroups.includes('alerts')) {
    const { pendingNotificationsWorker } = await import('./processors/pending-notifications.processor')
    const { hotAlertsWorker } = await import('./processors/hot-alerts.processor')
    const { mapCacheWorker } = await import('./processors/map-cache.processor')
    const { pipelineHealthWorker } = await import('./processors/pipeline-health.processor')
    const { outcomeCheckWorker } = await import('./processors/outcome-check.processor')
    const { dailyAuditWorker } = await import('./processors/daily-audit.processor')
    const { aiHealingWorker } = await import('./processors/ai-healing.processor')
    const { weeklyActionsWorker } = await import('./processors/weekly-actions.processor')
    const { channelOnboardingWorker } = await import('./processors/channel-onboarding.processor')
    const { trialExpiryWorker } = await import('./processors/trial-expiry.processor')
    workers.push(pendingNotificationsWorker, hotAlertsWorker, mapCacheWorker, pipelineHealthWorker, outcomeCheckWorker, dailyAuditWorker, aiHealingWorker, weeklyActionsWorker, channelOnboardingWorker, trialExpiryWorker)
  }

  if (selectedGroups.includes('telegram')) {
    const { notificationWorker } = await import('./processors/notification.processor')
    workers.push(notificationWorker)
  }

  if (selectedGroups.includes('whatsapp')) {
    const { whatsappNotificationWorker } = await import('./processors/whatsapp-notification.processor')
    workers.push(whatsappNotificationWorker)
  }

  if (selectedGroups.includes('email')) {
    const { emailWorker } = await import('./processors/notification-email.processor')
    workers.push(emailWorker)
  }

  // Dedicated enrichment group: results scraping + competitor analysis + contact/CNAE enrichment
  if (selectedGroups.includes('enrichment')) {
    const { resultsScrapingWorker } = await import('./processors/results-scraping.processor')
    const { competitionAnalysisWorker } = await import('./processors/competition-analysis.processor')
    const { contactEnrichmentWorker } = await import('./processors/contact-enrichment.processor')
    const { fornecedorEnrichmentWorker } = await import('./processors/fornecedor-enrichment.processor')
    const { documentExpiryWorker } = await import('./processors/document-expiry.processor')
    const { aiCompetitorClassifierWorker } = await import('./processors/ai-competitor-classifier.processor')
    const { proactiveSupplierScrapingWorker } = await import('./processors/proactive-supplier-scraping.processor')
    const { competitorRelevanceWorker } = await import('./processors/competitor-relevance.processor')
    workers.push(resultsScrapingWorker, competitionAnalysisWorker, contactEnrichmentWorker, fornecedorEnrichmentWorker, documentExpiryWorker, aiCompetitorClassifierWorker, proactiveSupplierScrapingWorker, competitorRelevanceWorker)
  }

  // Certidoes: Puppeteer-based certidao automation (polls certidao_jobs table)
  if (isFullMode || selectedGroups.includes('certidoes')) {
    const { certidoesWorker } = await import('./processors/certidoes.processor')
    workers.push(certidoesWorker)
  }

  // Pregão Chat Monitor: scraping + classification + test-login
  if (isFullMode || selectedGroups.includes('pregao-chat')) {
    const { pregaoChatPollWorker } = await import('./pregao-chat-monitor/processors/pregao-chat-poll.processor')
    const { pregaoChatClassifyWorker } = await import('./pregao-chat-monitor/processors/pregao-chat-classify.processor')
    const { pregaoPortalTestWorker } = await import('./pregao-chat-monitor/processors/pregao-portal-test.processor')
    workers.push(pregaoChatPollWorker, pregaoChatClassifyWorker, pregaoPortalTestWorker)
  }

  if (isFullMode || selectedGroups.includes('analysis')) {
    const { competitionAnalysisWorker } = await import('./processors/competition-analysis.processor')
    const { contactEnrichmentWorker } = await import('./processors/contact-enrichment.processor')
    const { fornecedorEnrichmentWorker } = await import('./processors/fornecedor-enrichment.processor')
    const { documentExpiryWorker } = await import('./processors/document-expiry.processor')
    const { aiCompetitorClassifierWorker } = await import('./processors/ai-competitor-classifier.processor')
    const { proactiveSupplierScrapingWorker } = await import('./processors/proactive-supplier-scraping.processor')
    const { competitorRelevanceWorker } = await import('./processors/competitor-relevance.processor')
    workers.push(competitionAnalysisWorker, contactEnrichmentWorker, fornecedorEnrichmentWorker, documentExpiryWorker, aiCompetitorClassifierWorker, proactiveSupplierScrapingWorker, competitorRelevanceWorker)
  }

  return workers
}

logger.info({ groups: selectedGroups, fullMode: isFullMode }, 'Worker groups selected')

// Will be populated in main()
let allWorkers: Worker[] = []
import { pendingNotificationsQueue } from './queues/pending-notifications.queue'
import { comprasgovScrapingQueue } from './queues/comprasgov-scraping.queue'
import { resultsScrapingQueue } from './queues/results-scraping.queue'
import { documentExpiryQueue } from './queues/document-expiry.queue'
import { fornecedorEnrichmentQueue } from './queues/fornecedor-enrichment.queue'
import { contactEnrichmentQueue } from './queues/contact-enrichment.queue'
import { arpScrapingQueue } from './queues/comprasgov-arp.queue'
import { legadoScrapingQueue } from './queues/comprasgov-legado.queue'
import { hotAlertsQueue } from './queues/hot-alerts.queue'
import { competitionAnalysisQueue } from './queues/competition-analysis.queue'
import { mapCacheQueue } from './queues/map-cache.queue'
import { pipelineHealthQueue } from './queues/pipeline-health.queue'
import { outcomePromptQueue } from './queues/outcome-prompt.queue'
import { aiCompetitorClassifierQueue } from './queues/ai-competitor-classifier.queue'
import { proactiveSupplierScrapingQueue } from './queues/proactive-supplier-scraping.queue'
import { competitorRelevanceQueue } from './queues/competitor-relevance.queue'
import { dailyAuditQueue } from './queues/daily-audit.queue'
import { certidoesQueue } from './queues/certidoes.queue'
import { aiHealingQueue } from './queues/ai-healing.queue'
import { weeklyActionsQueue } from './queues/weekly-actions.queue'
import { trialExpiryQueue } from './queues/trial-expiry.queue'

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

  // Schedule dadosabertos.compras.gov.br scraping every 4 hours (offset +1h to avoid PNCP overlap)
  await comprasgovScrapingQueue.add(
    'comprasgov-scrape',
    { pagina: 1 },
    {
      repeat: { every: 4 * 60 * 60 * 1000, offset: 60 * 60 * 1000 },
      jobId: 'comprasgov-scrape-repeat',
    },
  )
  logger.info('dadosabertos.compras.gov.br scraping job scheduled (every 4h, offset +1h)')

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

  // Schedule PNCP results scraping (competitive intelligence) every 6 hours (offset +30min)
  await resultsScrapingQueue.add(
    'results-scrape',
    { batch: 0 },
    {
      repeat: { every: 6 * 60 * 60 * 1000, offset: 30 * 60 * 1000 },
      jobId: 'results-scrape-repeat',
    },
  )
  logger.info('PNCP results scraping job scheduled (every 6h, offset +30min)')

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

  // Schedule fornecedor enrichment every 8 hours (enrich competitors with CNAE, porte, etc.)
  await fornecedorEnrichmentQueue.add(
    'fornecedor-enrich',
    { batch: 0 },
    {
      repeat: { every: 8 * 60 * 60 * 1000 },
      jobId: 'fornecedor-enrichment-repeat',
    },
  )
  logger.info('Fornecedor enrichment job scheduled (every 8h)')

  // Schedule ARP (Atas de Registro de Preço) scraping every 12 hours (offset +2h to avoid PNCP overlap)
  await arpScrapingQueue.add(
    'arp-scrape',
    { pagina: 1 },
    {
      repeat: { every: 12 * 60 * 60 * 1000, offset: 2 * 60 * 60 * 1000 },
      jobId: 'arp-scrape-repeat',
    },
  )
  logger.info('ARP scraping job scheduled (every 12h, offset +2h)')

  // Schedule legacy pregões (Lei 8.666) scraping every 24 hours (offset +3h)
  await legadoScrapingQueue.add(
    'legado-scrape',
    { pagina: 1 },
    {
      repeat: { every: 24 * 60 * 60 * 1000, offset: 3 * 60 * 60 * 1000 },
      jobId: 'legado-scrape-repeat',
    },
  )
  logger.info('Legacy pregoes scraping job scheduled (every 24h, offset +3h)')

  // Schedule hot alerts scan every 30 min — surfaces best opportunities fast
  await hotAlertsQueue.add(
    'hot-daily',
    {},
    {
      repeat: { every: 30 * 60 * 1000 },
      jobId: 'hot-scan-30m-repeat',
    },
  )
  logger.info('Hot alerts scan scheduled (every 30m)')

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

  // Schedule new-matches digest every 3 hours — notifies users of freshly found matches
  await hotAlertsQueue.add(
    'new-matches-digest',
    {},
    {
      repeat: { every: 3 * 60 * 60 * 1000 },
      jobId: 'new-matches-digest-3h-repeat',
    },
  )
  logger.info('New matches digest scheduled (every 3h)')

  // Schedule competition analysis materialization every 3h (offset +45min to avoid scraping overlap)
  await competitionAnalysisQueue.add(
    'materialize-stats',
    { mode: 'incremental' },
    {
      repeat: { every: 3 * 60 * 60 * 1000, offset: 45 * 60 * 1000 },
      jobId: 'competition-analysis-3h-repeat',
    },
  )
  logger.info('Competition analysis scheduled (every 3h, offset +45min)')

  // Schedule AI competitor classification every 2 hours (offset +20min)
  await aiCompetitorClassifierQueue.add(
    'classify-competitors',
    { batch: 0 },
    {
      repeat: { every: 2 * 60 * 60 * 1000, offset: 20 * 60 * 1000 },
      jobId: 'ai-competitor-classifier-2h-repeat',
    },
  )
  logger.info('AI competitor classifier scheduled (every 2h, offset +20min)')

  // Schedule map cache refresh every 1 hour
  await mapCacheQueue.add(
    'refresh-map',
    {},
    {
      repeat: { every: 60 * 60 * 1000 },
      jobId: 'map-cache-1h-repeat',
    },
  )
  logger.info('Map cache refresh scheduled (every 1h)')

  // Schedule pipeline health check every 5 minutes (autonomous watchdog)
  await pipelineHealthQueue.add(
    'health-check',
    {},
    {
      repeat: { every: 5 * 60 * 1000 },
      jobId: 'pipeline-health-5m-repeat',
    },
  )
  logger.info('Pipeline health watchdog scheduled (every 5m)')

  // Schedule daily audit at 3 AM BRT (06:00 UTC)
  await dailyAuditQueue.add(
    'daily-audit',
    {},
    {
      repeat: { pattern: '0 6 * * *' },
      jobId: 'daily-audit-3am-brt',
    },
  )
  logger.info('Daily audit scheduled (3 AM BRT / 06:00 UTC)')

  // Schedule AI healing check every 10 minutes (autonomous infrastructure healing)
  await aiHealingQueue.add(
    'health-check',
    {},
    {
      repeat: { every: 10 * 60 * 1000 },
      jobId: 'ai-healing-10m-repeat',
    },
  )
  logger.info('AI healing check scheduled (every 10m)')

  // Schedule daily healing report at 6 AM BRT (09:00 UTC)
  await aiHealingQueue.add(
    'daily-report',
    {},
    {
      repeat: { pattern: '0 9 * * *' },
      jobId: 'ai-healing-daily-report-6am-brt',
    },
  )
  logger.info('AI healing daily report scheduled (6 AM BRT / 09:00 UTC)')

  // Schedule outcome prompt check every 6 hours (won/lost outcome capture)
  await outcomePromptQueue.add(
    'outcome-check',
    {},
    {
      repeat: { every: 6 * 60 * 60 * 1000 },
      jobId: 'outcome-check-6h-repeat',
    },
  )
  logger.info('Outcome prompt check scheduled (every 6h)')

  // Schedule competitor relevance analysis every 2 hours (AI-powered contextual scoring, offset +10min)
  await competitorRelevanceQueue.add(
    'analyze-relevance',
    {},
    {
      repeat: { every: 2 * 60 * 60 * 1000, offset: 10 * 60 * 1000 },
      jobId: 'competitor-relevance-2h-repeat',
    },
  )
  logger.info('Competitor relevance analysis scheduled (every 2h, offset +10min)')

  // Schedule proactive supplier scraping every 4 hours (offset +90min to avoid PNCP overlap)
  await proactiveSupplierScrapingQueue.add(
    'proactive-supplier-sweep',
    {},
    {
      repeat: { every: 4 * 60 * 60 * 1000, offset: 90 * 60 * 1000 },
      jobId: 'proactive-supplier-sweep-4h-repeat',
    },
  )
  logger.info('Proactive supplier scraping scheduled (every 4h, offset +90min)')

  // Weekly actions: generate every Monday at 00:00 BRT (03:00 UTC)
  await weeklyActionsQueue.add(
    'generate-weekly-actions', {},
    { repeat: { pattern: '0 3 * * 1' }, jobId: 'weekly-actions-monday-repeat' },
  )
  logger.info('Weekly actions scheduled (Monday 00:00 BRT / 03:00 UTC)')

  // Watchlist activity check every 3h
  await weeklyActionsQueue.add(
    'watchlist-activity-check', {},
    { repeat: { every: 3 * 60 * 60 * 1000 }, jobId: 'watchlist-activity-3h-repeat' },
  )
  logger.info('Watchlist activity check scheduled (every 3h)')

  // Schedule certidoes poller every 15 seconds (polls certidao_jobs table for pending work)
  await certidoesQueue.add(
    'poll',
    {},
    {
      repeat: { every: 15_000 },
      removeOnComplete: true,
      removeOnFail: true,
      jobId: 'certidoes-poll-15s',
    },
  )
  logger.info('Certidoes poller scheduled (every 15s)')

  // Schedule trial expiry sweep daily at 2 AM BRT (05:00 UTC)
  await trialExpiryQueue.add(
    'trial-expiry-sweep',
    {},
    {
      repeat: { pattern: '0 5 * * *' },
      jobId: 'trial-expiry-daily-2am-brt',
    },
  )
  logger.info('Trial expiry sweep scheduled (daily 2 AM BRT / 05:00 UTC)')

  // Trigger immediate map cache refresh on startup
  mapCacheQueue.add('refresh-map-startup', {}).catch((err) => {
    logger.error({ err }, 'Failed to enqueue startup map cache refresh')
  })

  // Trigger full materialization on startup (non-blocking)
  competitionAnalysisQueue.add('materialize-stats-startup', { mode: 'full' }).catch((err) => {
    logger.error({ err }, 'Failed to enqueue startup competition analysis')
  })

  // Delay initial scrapes by 5 minutes to avoid startup query storm
  // Repeatable jobs (every 4h) still run on schedule — this only delays the first burst
  const STARTUP_DELAY = 5 * 60 * 1000 // 5 minutes
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
      { delay: STARTUP_DELAY },
    )
  }

  logger.info('Initial PNCP scraping jobs queued (delayed 5min to reduce startup load)')

  // Trigger dadosabertos scrape (delayed)
  await comprasgovScrapingQueue.add('comprasgov-initial', { pagina: 1 }, { delay: STARTUP_DELAY })
  logger.info('Initial dadosabertos.compras.gov.br scraping job queued (delayed 5min)')

  // Trigger PNCP SP+MG scrape (delayed)
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
        { delay: STARTUP_DELAY },
      )
    }
  }
  logger.info('Initial PNCP SP+MG UF-specific scraping jobs queued (delayed 5min)')

  // Trigger ARP and legacy scrape (delayed)
  await arpScrapingQueue.add('arp-initial', { pagina: 1 }, { delay: STARTUP_DELAY })
  logger.info('Initial ARP scraping job queued (delayed 5min)')

  await legadoScrapingQueue.add('legado-initial', { pagina: 1 }, { delay: STARTUP_DELAY })
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

  // DISABLED: keyword sweep on startup was causing 12M+ Supabase requests/day
  // The sweep already runs every 4h via setInterval, and new companies trigger
  // instant matching via the 'company-saved' Redis pub/sub pipeline.
  // runKeywordMatchingSweep().catch(err => {
  //   logger.error({ err }, 'Keyword matching sweep failed on startup')
  // })
  logger.info('Keyword matching sweep skipped on startup (runs every 4h + on company-saved trigger)')
}

/**
 * Registers ONLY the notification & hot-alert repeatable jobs.
 * Called by the 'alerts' worker group so these jobs survive Redis/PM2 restarts
 * even when the 'scraping' group is not running.
 */
async function setupAlertRepeatableJobs() {
  // Pending notifications every 5 minutes
  await pendingNotificationsQueue.add(
    'check-pending',
    {},
    {
      repeat: { every: 5 * 60 * 1000 },
      jobId: 'pending-notifications-5min',
    },
  )
  logger.info('[alerts] Pending notifications job scheduled (every 5 min)')

  // Hot alerts scan every 30 min
  await hotAlertsQueue.add(
    'hot-daily',
    {},
    {
      repeat: { every: 30 * 60 * 1000 },
      jobId: 'hot-scan-30m-repeat',
    },
  )
  logger.info('[alerts] Hot alerts scan scheduled (every 30m)')

  // Urgency check every hour
  await hotAlertsQueue.add(
    'urgency-check',
    {},
    {
      repeat: { every: 60 * 60 * 1000 },
      jobId: 'urgency-check-repeat',
    },
  )
  logger.info('[alerts] Urgency check job scheduled (every 1h)')

  // New-matches digest every 3 hours
  await hotAlertsQueue.add(
    'new-matches-digest',
    {},
    {
      repeat: { every: 3 * 60 * 60 * 1000 },
      jobId: 'new-matches-digest-3h-repeat',
    },
  )
  logger.info('[alerts] New matches digest scheduled (every 3h)')

  // Trial expiry sweep daily at 2 AM BRT (05:00 UTC)
  await trialExpiryQueue.add(
    'trial-expiry-sweep',
    {},
    {
      repeat: { pattern: '0 5 * * *' },
      jobId: 'trial-expiry-daily-2am-brt',
    },
  )
  logger.info('[alerts] Trial expiry sweep scheduled (daily 2 AM BRT)')
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
  const tenderIds = tenders.map((t: any) => t.id)
  const { data: existingDocs } = await supabase
    .from('tender_documents')
    .select('tender_id')
    .in('tender_id', tenderIds)

  const tendersWithDocs = new Set((existingDocs || []).map((d: any) => d.tender_id))
  const tendersToBackfill = tenders.filter((t: any) => !tendersWithDocs.has(t.id))

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
      // Log at warn level — PNCP might not have docs for every tender, but we still want visibility
      if (failed <= 10) {
        logger.warn({ tenderId: tender.id, err }, 'Comprasgov document fetch failed')
      }
    }
  }

  logger.info({ fetched, failed, total: tendersToBackfill.length }, 'Comprasgov document backfill complete')
}

async function main() {
  logger.info('Licitagram workers starting...')

  // Load only the workers needed for this process
  allWorkers = await loadWorkers()
  logger.info({ workerCount: allWorkers.length, groups: selectedGroups }, 'Workers loaded')

  // Set up repeatable jobs — scraping group registers all jobs,
  // alerts group registers only notification/hot-alert jobs (so they survive Redis restarts)
  if (isFullMode || selectedGroups.includes('scraping')) {
    await setupRepeatableJobs()
  } else if (selectedGroups.includes('alerts')) {
    await setupAlertRepeatableJobs()
  }

  // Telegram bot polling — only ONE process should run the bot (avoid duplicate polling)
  // In split mode: only 'telegram' group starts the bot
  // In full/legacy mode: 'notification' group starts it
  if (isFullMode || selectedGroups.includes('telegram') || (selectedGroups.includes('notification') && !selectedGroups.includes('alerts'))) {
    const { startBot } = await import('./telegram/bot')
    await startBot()
  }

  // Listen for Redis pub/sub events from the web app (only in full mode or matching group)
  if (isFullMode || selectedGroups.includes('matching'))
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
          const pipelineStart = Date.now()
          logger.info({ companyId }, 'Company saved — running instant matching pipeline')

          // Step 1: Generate AI search terms
          try {
            const { generateCompanyTerms } = await import('./processors/ai-triage.processor')
            const newTerms = await generateCompanyTerms(companyId)
            if (newTerms.length > 0) {
              logger.info({ companyId, count: newTerms.length }, 'Step 1: AI generated search terms')
            }
          } catch (err) {
            logger.warn({ companyId, err }, 'Step 1: Term generation failed (continuing)')
          }

          // Step 2: Profile company + generate embedding
          let hasEmbedding = false
          try {
            const { profileCompany } = await import('./processors/company-profiler')
            hasEmbedding = await profileCompany(companyId)
            logger.info({ companyId, hasEmbedding }, 'Step 2: Company profiled')
          } catch (err) {
            logger.warn({ companyId, err }, 'Step 2: Profiling failed (continuing)')
          }

          // Step 3: CNAE-filtered keyword matching (20x faster than full sweep)
          let keywordMatchCount = 0
          try {
            keywordMatchCount = await runKeywordMatchingForCompany(companyId)
            logger.info({ companyId, keywordMatchCount }, 'Step 3: CNAE-filtered keyword matching done')
          } catch (err) {
            logger.error({ companyId, err }, 'Step 3: Keyword matching failed')
          }

          // Step 4: Semantic matching (if company has embedding)
          if (hasEmbedding) {
            try {
              const { runSemanticMatching } = await import('./processors/semantic-matcher')
              const stats = await runSemanticMatching(companyId)
              logger.info({ companyId, ...stats }, 'Step 4: Semantic matching done')
            } catch (err) {
              logger.warn({ companyId, err }, 'Step 4: Semantic matching failed (continuing)')
            }
          }

          // Step 5: Enqueue AI triage for all matches
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
                .in('match_source', ['keyword', 'semantic'])
                .range(offset, offset + PAGE - 1)
              if (!page || page.length === 0) break
              allMatchIds.push(...page.map((m: { id: string }) => m.id))
              if (page.length < PAGE) break
              offset += PAGE
            }

            // AI triage disabled — pgvector semantic matching provides sufficient accuracy
            // TODO: remove ai-triage code entirely in cleanup sprint
            if (allMatchIds.length > 0) {
              logger.info({ companyId, matchCount: allMatchIds.length }, 'Step 5: AI triage SKIPPED (disabled — pgvector sufficient)')
            }
          } catch (err) {
            logger.error({ companyId, err }, 'Step 5: Failed to enqueue AI triage')
          }

          // Step 6: Refresh map cache
          try {
            const { refreshMapCacheForCompany } = await import('./processors/map-cache.processor')
            const mapRows = await refreshMapCacheForCompany(companyId)
            logger.info({ companyId, mapRows }, 'Step 6: Map cache refreshed')
          } catch (err) {
            logger.error({ companyId, err }, 'Step 6: Map cache refresh failed')
          }

          // Step 7: Targeted competitor-relevance analysis (bypasses 12h skip)
          try {
            const { competitorRelevanceQueue } = await import('./queues/competitor-relevance.queue')
            await competitorRelevanceQueue.add(
              `on-company-save-${companyId}`,
              { companyId },
              { jobId: `relevance-company-${companyId}-${Date.now()}` },
            )
            logger.info({ companyId }, 'Step 7: Competitor relevance enqueued')
          } catch (err) {
            logger.error({ companyId, err }, 'Step 7: Failed to enqueue competitor relevance')
          }

          const elapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1)
          logger.info({ companyId, elapsed: `${elapsed}s`, keywordMatchCount }, 'Pipeline complete')
        }
      } catch (err) {
        logger.error({ err, channel }, 'Failed to process Redis event')
      }
    })
    logger.info('Listening for Redis events (rematch-done, company-saved)')
  } catch (err) {
    logger.warn({ err }, 'Failed to setup Redis event listener (non-critical)')
  }

  // Background tasks only in full mode or specific groups
  if (isFullMode || selectedGroups.includes('matching')) {
    // Schedule CNAE classification backfill every 15 minutes
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

    // Schedule monthly match counter reset
    scheduleMonthlyReset()

    // AI triage sweep DISABLED — pgvector semantic matching provides sufficient accuracy
    // Matches go directly to notification pipeline without LLM re-scoring
    logger.info('AI triage sweep DISABLED (pgvector sufficient)')
  }

  if (isFullMode || selectedGroups.includes('scraping')) {
    // Backfill documents for comprasgov tenders (one-time, non-blocking)
    backfillComprasgovDocuments().catch(err => {
      logger.error({ err }, 'Comprasgov document backfill failed')
    })
  }

  // ─── Enrichment group: autonomous competitive intelligence pipeline ──────
  if (selectedGroups.includes('enrichment')) {
    // Schedule enrichment jobs (these are owned by this worker, not scraping)
    await resultsScrapingQueue.add(
      'results-scrape', { batch: 0 },
      { repeat: { every: 6 * 60 * 60 * 1000 }, jobId: 'results-scrape-6h-repeat' },
    )
    await fornecedorEnrichmentQueue.add(
      'fornecedor-enrich', { batch: 0 },
      { repeat: { every: 8 * 60 * 60 * 1000 }, jobId: 'fornecedor-enrichment-8h-repeat' },
    )
    await competitionAnalysisQueue.add(
      'materialize-stats', { mode: 'incremental' },
      { repeat: { every: 3 * 60 * 60 * 1000 }, jobId: 'competition-analysis-3h-enrichment' },
    )
    await documentExpiryQueue.add(
      'document-expiry-check', { checkAll: true },
      { repeat: { every: 7 * 24 * 60 * 60 * 1000 }, jobId: 'document-expiry-weekly-enrichment' },
    )
    await aiCompetitorClassifierQueue.add(
      'classify-competitors', { batch: 0 },
      { repeat: { every: 2 * 60 * 60 * 1000 }, jobId: 'ai-competitor-classifier-2h-enrichment' },
    )
    await proactiveSupplierScrapingQueue.add(
      'proactive-supplier-sweep', {},
      { repeat: { every: 4 * 60 * 60 * 1000 }, jobId: 'proactive-supplier-sweep-4h-enrichment' },
    )
    await competitorRelevanceQueue.add(
      'analyze-relevance', {},
      { repeat: { every: 1 * 60 * 60 * 1000 }, jobId: 'competitor-relevance-1h-enrichment' },
    )
    await contactEnrichmentQueue.add(
      'contact-enrich', { batch: 0 },
      { repeat: { every: 4 * 60 * 60 * 1000 }, jobId: 'contact-enrichment-4h-repeat' },
    )
    logger.info('Enrichment repeatable jobs scheduled (results 6h, fornecedor 8h, stats 3h, docs weekly, AI classifier 2h, proactive suppliers 4h, relevance 1h, contacts 4h)')

    // Trigger immediate full materialization + enrichment on startup
    competitionAnalysisQueue.add('materialize-full-startup', { mode: 'full' }).catch(err => {
      logger.error({ err }, 'Failed to enqueue startup full materialization')
    })
    fornecedorEnrichmentQueue.add('fornecedor-startup', { batch: 0 }).catch(err => {
      logger.error({ err }, 'Failed to enqueue startup fornecedor enrichment')
    })
    resultsScrapingQueue.add('results-startup', { batch: 0 }).catch(err => {
      logger.error({ err }, 'Failed to enqueue startup results scraping')
    })
    aiCompetitorClassifierQueue.add('classify-startup', { batch: 0 }).catch(err => {
      logger.error({ err }, 'Failed to enqueue startup AI competitor classifier')
    })
    proactiveSupplierScrapingQueue.add('proactive-supplier-startup', {}).catch(err => {
      logger.error({ err }, 'Failed to enqueue startup proactive supplier scraping')
    })
    competitorRelevanceQueue.add('relevance-startup', {}).catch(err => {
      logger.error({ err }, 'Failed to enqueue startup competitor relevance analysis')
    })
    logger.info('Enrichment startup jobs enqueued (full materialization + fornecedor + results + AI classifier + proactive suppliers + relevance)')
  }

  // ─── Certidoes group: autonomous certidao polling ──────────────────────────
  if (selectedGroups.includes('certidoes')) {
    await certidoesQueue.add(
      'poll', {},
      { repeat: { every: 15_000 }, removeOnComplete: true, removeOnFail: true, jobId: 'certidoes-poll-15s-dedicated' },
    )
    logger.info('Certidoes dedicated poller scheduled (every 15s)')
  }

  // Semantic matching: embed tenders + profile companies + run sweep (non-blocking)
  // Ollama/BGE-M3 runs locally (always available), so semantic matching is always enabled
  if (isFullMode || selectedGroups.includes('matching')) {
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
  }

  // ─── Memory pressure monitoring ─────────────────────────────────────────────
  // When heap exceeds 400 MB, pause all workers for 10 s to let GC reclaim memory.
  const HEAP_LIMIT = 800 * 1024 * 1024 // 800 MB (VPS has 7.8 GB RAM)
  setInterval(async () => {
    const { heapUsed } = process.memoryUsage()
    if (heapUsed > HEAP_LIMIT) {
      logger.warn({ heapUsedMB: Math.round(heapUsed / 1024 / 1024) }, 'Memory pressure — pausing all workers for 10 s')
      await Promise.allSettled(allWorkers.map((w) => w.pause()))
      // Force garbage collection if exposed
      if (global.gc) global.gc()
      await new Promise((r) => setTimeout(r, 10_000))
      await Promise.allSettled(allWorkers.map((w) => w.resume()))
      logger.info({ heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) }, 'Workers resumed after memory pressure pause')
    }
  }, 30_000) // Check every 30 s

  logger.info({ groups: selectedGroups, workerCount: allWorkers.length }, 'Workers running. Press Ctrl+C to stop.')
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
    // Give workers 15 s to finish active jobs before force-exiting
    const timeout = setTimeout(() => {
      logger.warn('Shutdown timed out after 15 s — force exiting')
      process.exit(1)
    }, 15_000)
    timeout.unref()
    await Promise.allSettled(allWorkers.map((w) => w.close()))
    clearTimeout(timeout)
    logger.info('All workers closed cleanly')
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
