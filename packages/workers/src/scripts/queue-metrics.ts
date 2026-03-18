/**
 * Queue Depth Metrics — Lightweight monitoring daemon
 *
 * Logs queue depths every METRICS_INTERVAL_MS (default 60s) as structured JSON.
 * Emits warnings when queues exceed thresholds.
 *
 * Usage:
 *   pm2 start ecosystem.config.js --only queue-metrics
 *   # or directly:
 *   METRICS_INTERVAL_MS=30000 tsx src/scripts/queue-metrics.ts
 *
 * Output:
 *   {"level":"info","queue":"extraction","waiting":1234,"active":3,"delayed":0,"completed":5000,"failed":12}
 *   {"level":"warn","queue":"extraction","waiting":5000,"msg":"Queue depth exceeds threshold"}
 */
import 'dotenv/config'
import { Queue } from 'bullmq'
import { connection } from '../queues/connection'
import { logger } from '../lib/logger'

const INTERVAL = parseInt(process.env.METRICS_INTERVAL_MS || '60000', 10)

// Queue name → warning threshold (waiting jobs)
const QUEUE_THRESHOLDS: Record<string, number> = {
  scraping: 500,
  extraction: 2000,
  matching: 1000,
  notification: 500,
  'pending-notifications': 100,
  'comprasgov-scraping': 200,
  'results-scraping': 50,
  'document-expiry': 50,
  'fornecedor-enrichment': 50,
  'comprasgov-arp': 100,
  'comprasgov-legado': 100,
  'ai-triage': 500,
  'semantic-matching': 200,
  'hot-alerts': 10,
  'competition-analysis': 10,
  'contact-enrichment': 50,
}

const QUEUE_NAMES = Object.keys(QUEUE_THRESHOLDS)

// Create lightweight Queue instances (not Workers — no processing)
const queues = QUEUE_NAMES.map(name => new Queue(name, { connection }))

interface QueueSnapshot {
  name: string
  waiting: number
  active: number
  delayed: number
  completed: number
  failed: number
}

async function collectMetrics(): Promise<QueueSnapshot[]> {
  const snapshots: QueueSnapshot[] = []

  await Promise.allSettled(
    queues.map(async (queue) => {
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed')
        snapshots.push({
          name: queue.name,
          waiting: counts.waiting || 0,
          active: counts.active || 0,
          delayed: counts.delayed || 0,
          completed: counts.completed || 0,
          failed: counts.failed || 0,
        })
      } catch (err) {
        logger.error({ queue: queue.name, err }, 'Failed to get queue metrics')
      }
    }),
  )

  return snapshots
}

async function reportMetrics() {
  const snapshots = await collectMetrics()

  // Summary line
  const totalWaiting = snapshots.reduce((sum, s) => sum + s.waiting, 0)
  const totalActive = snapshots.reduce((sum, s) => sum + s.active, 0)
  const totalFailed = snapshots.reduce((sum, s) => sum + s.failed, 0)

  logger.info(
    { totalWaiting, totalActive, totalFailed, queues: snapshots.length },
    'Queue metrics snapshot',
  )

  // Per-queue details (only log non-empty queues to reduce noise)
  for (const snap of snapshots) {
    if (snap.waiting > 0 || snap.active > 0 || snap.failed > 0) {
      logger.info(
        { queue: snap.name, ...snap },
        `Queue: ${snap.name}`,
      )
    }

    // Threshold warnings
    const threshold = QUEUE_THRESHOLDS[snap.name]
    if (threshold && snap.waiting > threshold) {
      logger.warn(
        { queue: snap.name, waiting: snap.waiting, threshold },
        `ALERT: Queue ${snap.name} depth ${snap.waiting} exceeds threshold ${threshold}`,
      )
    }

    // Failed job warnings
    if (snap.failed > 10) {
      logger.warn(
        { queue: snap.name, failed: snap.failed },
        `ALERT: Queue ${snap.name} has ${snap.failed} failed jobs`,
      )
    }
  }

  // Memory usage
  const { heapUsed, rss } = process.memoryUsage()
  logger.info(
    { heapMB: Math.round(heapUsed / 1024 / 1024), rssMB: Math.round(rss / 1024 / 1024) },
    'Metrics process memory',
  )
}

async function main() {
  logger.info({ intervalMs: INTERVAL }, 'Queue metrics daemon starting')

  // Initial report
  await reportMetrics()

  // Periodic reporting
  setInterval(async () => {
    try {
      await reportMetrics()
    } catch (err) {
      logger.error({ err }, 'Metrics collection failed')
    }
  }, INTERVAL)
}

async function gracefulShutdown() {
  await Promise.allSettled(queues.map(q => q.close()))
  process.exit(0)
}

process.on('SIGINT', gracefulShutdown)
process.on('SIGTERM', gracefulShutdown)

main().catch(err => {
  logger.error({ err }, 'Queue metrics daemon failed')
  process.exit(1)
})
