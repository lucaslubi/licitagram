import { startAllWorkers } from './workers'

export { queues, createGovQueue, createGovWorker } from './queues'
export { connection, GOV_QUEUE_PREFIX } from './connection'
export { startAllWorkers } from './workers'

// Entry point when launched via `node dist/index.js` or `tsx src/index.ts`
if (require.main === module) {
  startAllWorkers()
}
