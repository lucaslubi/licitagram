/**
 * Worker entrypoint: MATCHING / INTELLIGENCE pool
 *
 * Registers matching, AI triage, semantic matching, hot alerts, notifications,
 * and competition analysis workers. Handles Telegram bot + Redis pub/sub events.
 *
 * Usage:
 *   pm2 start ecosystem.config.js --only worker-matching
 *   # or directly:
 *   node --max-old-space-size=1024 dist/worker-matching.js
 */
import 'dotenv/config'
import { logger } from './lib/logger'
import { supabase } from './lib/supabase'
import { runKeywordMatchingSweep } from './processors/keyword-matcher'
import { batchClassifyTenders } from './ai/cnae-classifier'

// ─── Workers (matching / notifications / intelligence) ──────────────────────
import { matchingWorker } from './processors/matching.processor'
import { notificationWorker } from './processors/notification.processor'
import { pendingNotificationsWorker } from './processors/pending-notifications.processor'
import { aiTriageWorker } from './processors/ai-triage.processor'
import { semanticMatchingWorker } from './processors/semantic-matching.processor'
import { hotAlertsWorker } from './processors/hot-alerts.processor'
import { competitionAnalysisWorker } from './processors/competition-analysis.processor'

// ─── Queues (for scheduling) ────────────────────────────────────────────────
import { pendingNotificationsQueue } from './queues/pending-notifications.queue'
import { hotAlertsQueue } from './queues/hot-alerts.queue'
import { competitionAnalysisQueue } from './queues/competition-analysis.queue'

import { startBot } from './telegram/bot'

const POOL_NAME = 'matching'

const allWorkers = [
  matchingWorker, notificationWorker, pendingNotificationsWorker,
  aiTriageWorker, semanticMatchingWorker, hotAlertsWorker,
  competitionAnalysisWorker,
]

async function setupMatchingJobs() {
  // Pending notifications every 5 min
  await pendingNotificationsQueue.add(
    'check-pending', {},
    { repeat: { every: 5 * 60 * 1000 }, jobId: 'pending-notifications-5min' },
  )

  // Hot alerts every 1h
  await hotAlertsQueue.add(
    'hot-daily', {},
    { repeat: { every: 60 * 60 * 1000 }, jobId: 'hot-scan-1h-repeat' },
  )

  // Urgency check every 1h
  await hotAlertsQueue.add(
    'urgency-check', {},
    { repeat: { every: 60 * 60 * 1000 }, jobId: 'urgency-check-repeat' },
  )

  // Competition analysis every 3h
  await competitionAnalysisQueue.add(
    'materialize-stats', { mode: 'incremental' },
    { repeat: { every: 3 * 60 * 60 * 1000 }, jobId: 'competition-analysis-3h-repeat' },
  )

  // Full materialization on startup
  competitionAnalysisQueue.add('materialize-stats-startup', { mode: 'full' }).catch(err => {
    logger.error({ err, pool: POOL_NAME }, 'Failed to enqueue startup competition analysis')
  })

  logger.info({ pool: POOL_NAME }, 'Repeatable matching jobs scheduled')
}

async function setupRedisEvents() {
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
          logger.info({ companyId, matchCount, pool: POOL_NAME }, 'Rematch done — triggering notifications')
          await pendingNotificationsQueue.add(
            `rematch-notify-${companyId}`, {},
            { jobId: `rematch-notify-${companyId}-${Date.now()}` },
          )
        } else if (channel === 'licitagram:company-saved') {
          const { companyId } = JSON.parse(message)
          logger.info({ companyId, pool: POOL_NAME }, 'Company saved — generating terms + matching')

          try {
            const { generateCompanyTerms } = await import('./processors/ai-triage.processor')
            const newTerms = await generateCompanyTerms(companyId)
            if (newTerms.length > 0) {
              logger.info({ companyId, count: newTerms.length }, 'AI generated terms for company')
            }
          } catch (err) {
            logger.warn({ companyId, err }, 'Term generation failed')
          }

          try { await runKeywordMatchingSweep() } catch (err) {
            logger.error({ companyId, err }, 'Keyword matching failed')
          }

          try {
            const { aiTriageQueue } = await import('./queues/ai-triage.queue')
            const PAGE = 1000
            let offset = 0
            const allMatchIds: string[] = []
            while (true) {
              const { data: page } = await supabase
                .from('matches').select('id')
                .eq('company_id', companyId).eq('match_source', 'keyword')
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
              logger.info({ companyId, matchCount: allMatchIds.length }, 'Enqueued AI triage')
            }
          } catch (err) {
            logger.error({ companyId, err }, 'Failed to enqueue AI triage')
          }
        }
      } catch (err) {
        logger.error({ err, channel, pool: POOL_NAME }, 'Failed to process Redis event')
      }
    })
    logger.info({ pool: POOL_NAME }, 'Listening for Redis events')
  } catch (err) {
    logger.warn({ err, pool: POOL_NAME }, 'Failed to setup Redis events (non-critical)')
  }
}

async function main() {
  logger.info({ pool: POOL_NAME }, 'Starting matching worker pool...')
  await setupMatchingJobs()
  await startBot()
  await setupRedisEvents()

  // CNAE classification every 15 min
  batchClassifyTenders(500).catch(err => {
    logger.error({ err }, 'CNAE classification backfill failed on startup')
  })
  setInterval(async () => {
    try { await batchClassifyTenders(500) } catch (err) {
      logger.error({ err }, 'CNAE classification failed')
    }
  }, 15 * 60 * 1000)

  // Keyword matching every 4h
  runKeywordMatchingSweep().catch(err => {
    logger.error({ err }, 'Keyword matching sweep failed on startup')
  })
  setInterval(async () => {
    try { await runKeywordMatchingSweep() } catch (err) {
      logger.error({ err }, 'Keyword matching sweep failed')
    }
  }, 4 * 60 * 60 * 1000)

  // Monthly counter reset
  const runReset = async () => {
    try {
      const { data, error } = await supabase.rpc('reset_monthly_counters')
      if (error) logger.error({ error }, 'Monthly reset failed')
      else if (typeof data === 'number' && data > 0) logger.info({ count: data }, 'Monthly counters reset')
    } catch (err) { logger.error({ err }, 'Monthly reset exception') }
  }
  runReset()
  setInterval(runReset, 24 * 60 * 60 * 1000)

  // Semantic matching
  if (process.env.JINA_API_KEY || process.env.OPENAI_API_KEY) {
    Promise.all([
      import('./processors/company-profiler').then(m => m.batchEmbedTenders(500)),
      import('./processors/company-profiler').then(m => m.profileAllCompanies()),
    ]).then(() => {
      return import('./processors/semantic-matcher').then(m => m.runSemanticMatchingSweep())
    }).catch(err => {
      logger.error({ err }, 'Semantic matching init failed')
    })

    setInterval(async () => {
      try {
        const { batchEmbedTenders, profileAllCompanies } = await import('./processors/company-profiler')
        await batchEmbedTenders(500)
        await profileAllCompanies()
        const { runSemanticMatchingSweep } = await import('./processors/semantic-matcher')
        await runSemanticMatchingSweep()
      } catch (err) { logger.error({ err }, 'Semantic matching sweep failed') }
    }, 6 * 60 * 60 * 1000)

    logger.info({ pool: POOL_NAME }, 'Semantic matching enabled')
  }

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

  logger.info({ pool: POOL_NAME, workers: allWorkers.length }, 'Matching pool running')
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
  logger.error({ err, pool: POOL_NAME }, 'Failed to start matching pool')
  process.exit(1)
})
