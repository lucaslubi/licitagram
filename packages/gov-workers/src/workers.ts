import { createGovWorker } from './queues'
import { noopProcessor } from './jobs/noop'
import pino from 'pino'

const log = pino({
  name: 'gov-workers',
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', colorize: true } }
    : undefined,
})

export function startAllWorkers() {
  const noop = createGovWorker('noop', noopProcessor)
  noop.on('completed', (job) => log.info({ jobId: job.id }, 'noop job completed'))
  noop.on('failed', (job, err) => log.error({ jobId: job?.id, err }, 'noop job failed'))

  log.info({ workers: ['noop'] }, 'gov-workers started')

  const shutdown = async (signal: NodeJS.Signals) => {
    log.info({ signal }, 'shutting down gov-workers')
    await noop.close()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  return { noop }
}
