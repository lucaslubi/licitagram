/**
 * Licitagram Bot — legacy DB-polling entrypoint (DEPRECATED, retained as no-op).
 *
 * The DB-polling loop was superseded in Phase 1 by the BullMQ executor
 * (see `src/bot/processors/bot-session-execute.processor.ts`). The new
 * worker is started via `src/index.ts` when the `bot` group is enabled.
 *
 * We keep this file as a safe no-op entry so any PM2 process still
 * configured to run it just sleeps and logs — it will not compete with
 * the BullMQ worker for sessions. Once the PM2 config is updated on the
 * VPS to drop this process, the file can be deleted.
 */

import { logger } from './lib/logger'

async function main(): Promise<void> {
  logger.warn(
    'licitagram-bot legacy entrypoint is deprecated; sessions are now handled ' +
      'by the BullMQ worker started via src/index.ts --queues=bot. This process ' +
      'will sleep indefinitely. Remove it from the PM2 config to reclaim the slot.',
  )
  // Keep the process alive without consuming CPU, so PM2 doesn't restart us
  // in a loop. SIGTERM/SIGINT still exits cleanly.
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => resolve())
    process.on('SIGTERM', () => resolve())
  })
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : err }, 'Fatal bot error')
  process.exit(1)
})
