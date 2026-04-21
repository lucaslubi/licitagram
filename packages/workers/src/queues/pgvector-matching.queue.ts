import { Queue } from 'bullmq'
import { connection } from './connection'

export interface PgvectorMatchingJobData {
  tenderId: string
  /** Opcional: flag pra forçar re-matching mesmo se já existe pra esse tender. */
  force?: boolean
}

/**
 * Queue do engine determinístico pgvector + rules.
 * Roda em paralelo ao ai-triage (shadow mode) antes de substituir.
 */
export const pgvectorMatchingQueue = new Queue<PgvectorMatchingJobData, unknown, string>(
  'pgvector-matching',
  {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: { count: 500, age: 24 * 3600 },
      removeOnFail: { count: 200, age: 7 * 24 * 3600 },
    },
  },
)
