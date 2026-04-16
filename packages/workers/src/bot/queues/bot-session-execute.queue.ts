/**
 * Bot Session Execute Queue
 *
 * Replaces the old DB-polling loop. The web API enqueues a job here every
 * time a bot_session is created, resumed, or must be (re)started after a
 * worker crash (handled by the watchdog which re-enqueues).
 *
 * Concurrency design:
 *   - BullMQ concurrency 5 per worker (tunable).
 *   - A Postgres-level "soft lock" via bot_sessions.locked_until +
 *     worker_id prevents two workers from grabbing the same session. The
 *     processor performs a conditional UPDATE: set locked_until = now+5m
 *     WHERE id = :id AND (locked_until IS NULL OR locked_until < now). If
 *     rowcount = 0 the job is dropped as already-locked.
 *   - Jobs are deduped by jobId = `session-${id}` so rapid-fire retomar
 *     clicks don't fan out.
 */

import { Queue } from 'bullmq'
import { connection } from '../../queues/connection'

export const QUEUE_NAME = 'bot-session-execute'

export interface BotSessionExecuteJobData {
  sessionId: string
  /** Why this job was enqueued — for observability / debugging. */
  source: 'initial' | 'resume' | 'watchdog' | 'manual'
}

export const botSessionExecuteQueue = new Queue<BotSessionExecuteJobData>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    // Keep completed jobs for 24 h of debugging; failed ones for a week.
    removeOnComplete: { count: 500, age: 24 * 3600 },
    removeOnFail: { count: 1000, age: 7 * 24 * 3600 },
  },
})

/**
 * Enqueue a session for execution. Idempotent: if a job for this session
 * already exists (regardless of state), BullMQ dedupes by jobId.
 */
export async function enqueueBotSession(
  sessionId: string,
  source: BotSessionExecuteJobData['source'],
  delayMs = 0,
): Promise<void> {
  await botSessionExecuteQueue.add(
    'execute',
    { sessionId, source },
    {
      jobId: `session-${sessionId}`,
      delay: delayMs,
    },
  )
}
