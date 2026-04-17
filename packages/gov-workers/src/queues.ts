import { Queue, Worker, type Processor, type WorkerOptions, type QueueOptions } from 'bullmq'
import { connection, GOV_QUEUE_PREFIX } from './connection'

const DEFAULT_JOB_OPTIONS: QueueOptions['defaultJobOptions'] = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 3600 },
}

/**
 * Create a BullMQ Queue guaranteed to carry the `licitagov:` prefix (RI-6).
 * Consumers should NOT instantiate Queue directly.
 */
export function createGovQueue<Data = unknown, Result = unknown>(name: string) {
  return new Queue<Data, Result>(name, {
    connection,
    prefix: GOV_QUEUE_PREFIX,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  })
}

export function createGovWorker<Data = unknown, Result = unknown>(
  name: string,
  processor: Processor<Data, Result>,
  opts: Omit<WorkerOptions, 'connection' | 'prefix'> = {},
) {
  return new Worker<Data, Result>(name, processor, {
    connection,
    prefix: GOV_QUEUE_PREFIX,
    concurrency: 1,
    ...opts,
  })
}

export const queues = {
  /** Placeholder queue used in Fase 0 to smoke-test the pipeline. */
  noop: createGovQueue<{ ping: string }, { ok: true }>('noop'),
} as const

export type GovQueueName = keyof typeof queues
