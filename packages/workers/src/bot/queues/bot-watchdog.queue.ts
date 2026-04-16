/**
 * Bot Watchdog Queue
 *
 * BullMQ repeatable job that runs every 2 minutes and reaps zombie
 * bot_sessions whose worker has died or lost heartbeat.
 *
 * A session is considered zombie when:
 *   status = 'active' AND
 *   (last_heartbeat IS NULL OR last_heartbeat < now() - 5 minutes)
 *
 * Reaping = UPDATE status='failed', result.error='watchdog_heartbeat_timeout'
 * and emitting a `watchdog_reaped` action row for the audit trail.
 *
 * The processor lives in ../processors/bot-watchdog.processor.ts.
 */

import { Queue } from 'bullmq'
import { connection } from '../../queues/connection'

export const QUEUE_NAME = 'bot-watchdog'

export const botWatchdogQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: { count: 100, age: 60 * 60 * 24 },
    removeOnFail: { count: 100, age: 60 * 60 * 24 * 7 },
  },
})

export interface BotWatchdogJobData {
  // No payload — the job just runs the sweep.
  _tick?: number
}

/**
 * Register the repeatable sweep job. Call this once at worker boot from
 * the index.ts lazy-loader. Idempotent: the repeat scheduler dedupes on
 * the job name + pattern.
 */
export async function ensureBotWatchdogScheduled(): Promise<void> {
  await botWatchdogQueue.add(
    'sweep',
    { _tick: Date.now() },
    {
      repeat: { every: 2 * 60 * 1000 }, // every 2 minutes
      jobId: 'bot-watchdog-sweep', // dedupe by name
    },
  )
}
