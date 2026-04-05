import { Worker, type Job } from 'bullmq'
import { connection } from '../queues/connection'
import type { CompetitionAnalysisJobData } from '../queues/competition-analysis.queue'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'
import IORedis from 'ioredis'

const REDIS_KEY_LAST_RUN = 'licitagram:competition-analysis:last-run'
const BATCH_SIZE = 500 // CNPJs per RPC call

const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

async function processCompetitionAnalysis(job: Job<CompetitionAnalysisJobData>) {
  const { mode } = job.data
  const startTime = Date.now()

  logger.info({ mode }, 'Starting competition analysis materialization')

  let cnpjs: string[]

  if (mode === 'incremental') {
    // Get last run timestamp from Redis
    const lastRun = await redis.get(REDIS_KEY_LAST_RUN)
    const since = lastRun || '2000-01-01T00:00:00Z'

    // Find CNPJs with new data since last run
    const { data, error } = await supabase
      .from('competitors')
      .select('cnpj')
      .not('cnpj', 'is', null)
      .gte('created_at', since)

    if (error) {
      logger.error({ error }, 'Failed to fetch new competitor CNPJs')
      throw error
    }

    // Deduplicate
    cnpjs = [...new Set((data || []).map((r: { cnpj: string }) => r.cnpj).filter(Boolean))] as string[]

    if (cnpjs.length === 0) {
      logger.info('No new competitor data since last run — skipping materialization')
      await redis.set(REDIS_KEY_LAST_RUN, new Date().toISOString())
      return
    }
  } else {
    // Full mode: get all CNPJs with >= 3 participations
    const { data, error } = await supabase.rpc('get_all_competitor_cnpjs_with_min_participations', {
      p_min_participations: 1,
    })

    // Fallback: if RPC doesn't exist, do a raw query
    if (error) {
      logger.warn({ error }, 'RPC not available, using direct query for full mode')
      const { data: fallback } = await supabase
        .from('competitors')
        .select('cnpj')
        .not('cnpj', 'is', null)

      const fallbackRows = (fallback || []) as Array<{ cnpj: string | null }>
      cnpjs = [...new Set(fallbackRows.map((r) => r.cnpj).filter((v): v is string => Boolean(v)))]
    } else {
      cnpjs = (data || []).map((r: { cnpj: string }) => r.cnpj)
    }
  }

  logger.info({ cnpjCount: cnpjs.length, mode }, 'Processing competitor CNPJs')

  let totalUpserted = 0

  // Process in batches to avoid exceeding RPC parameter limits
  for (let i = 0; i < cnpjs.length; i += BATCH_SIZE) {
    const batch = cnpjs.slice(i, i + BATCH_SIZE)

    try {
      const { data: count, error } = await supabase.rpc('materialize_competitor_stats', {
        p_cnpjs: batch,
      })

      if (error) {
        logger.error({ error, batchStart: i, batchSize: batch.length }, 'Materialization batch failed')
        continue
      }

      totalUpserted += (count as number) || 0
    } catch (err) {
      logger.error({ err, batchStart: i }, 'Materialization batch exception')
    }
  }

  // Update last run timestamp
  await redis.set(REDIS_KEY_LAST_RUN, new Date().toISOString())

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  logger.info(
    { totalUpserted, cnpjsProcessed: cnpjs.length, mode, elapsedSeconds: elapsed },
    'Competition analysis materialization complete',
  )
}

export const competitionAnalysisWorker = new Worker<CompetitionAnalysisJobData>(
  'competition-analysis',
  processCompetitionAnalysis,
  {
    connection,
    concurrency: 1,
    stalledInterval: 300_000,
    lockDuration: 300_000,
  },
)

competitionAnalysisWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Competition analysis job failed')
})
