import { Queue } from 'bullmq'
import { connection } from './connection'

export type DataExportJobData = { jobId: string }

export const dataExportQueue = new Queue<DataExportJobData>('data-export', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { count: 200, age: 7 * 24 * 3600 },
    removeOnFail: { count: 200, age: 14 * 24 * 3600 },
  },
})
