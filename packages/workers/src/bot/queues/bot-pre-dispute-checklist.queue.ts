/**
 * Bot Pre-Dispute Checklist Queue
 *
 * 24 hours before a monitored pregão opens, run a checklist:
 *
 *   1. Re-extract key clauses from the edital via the existing AI
 *      extraction pipeline; flag anything that changed vs initial parse.
 *   2. Run CND / certidões check (reuses the scrapers/certidao-*.ts
 *      helpers). If any is expired or about to expire within 30 days,
 *      emit an alert.
 *   3. Compute a Floor Optimizer suggestion for each item.
 *   4. Cross-reference competitor intel — list the top 3 CNPJs that
 *      historically win this category/UASG and flag which ones are
 *      registered for THIS pregão.
 *   5. Compose a WhatsApp + email summary with pass/fail for each item.
 *
 * Scheduled from the bot_session creation flow with delay = start_ts - 24h.
 * Idempotent: jobId = `checklist-{session_id}`.
 */

import { Queue } from 'bullmq'
import { connection } from '../../queues/connection'

export const QUEUE_NAME = 'bot-pre-dispute-checklist'

export interface PreDisputeChecklistJobData {
  sessionId: string
  /** Optional — if present, the checklist will include Floor Optimizer output for each item. */
  items?: Array<{ descricao: string; catmat_catser?: string; unidade_medida?: string }>
  /** Target time to run. The queue schedules via `delay`. */
  runAt: string
}

export const botPreDisputeChecklistQueue = new Queue<PreDisputeChecklistJobData>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { count: 200, age: 7 * 24 * 3600 },
    removeOnFail: { count: 500, age: 14 * 24 * 3600 },
  },
})

/**
 * Schedule a checklist to run at `runAt` (ISO 8601) or immediately if
 * already past.
 */
export async function schedulePreDisputeChecklist(
  sessionId: string,
  runAt: Date,
  items?: PreDisputeChecklistJobData['items'],
): Promise<void> {
  const delay = Math.max(0, runAt.getTime() - Date.now())
  await botPreDisputeChecklistQueue.add(
    'checklist',
    { sessionId, runAt: runAt.toISOString(), items },
    { jobId: `checklist-${sessionId}`, delay },
  )
}
