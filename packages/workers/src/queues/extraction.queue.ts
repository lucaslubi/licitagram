import { Queue } from 'bullmq'
import { connection } from './connection'

export interface ExtractionJobData {
  tenderId: string
}

export const extractionQueue = new Queue<ExtractionJobData, unknown, string>('extraction', {
  connection,
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: 'exponential', delay: 8000 },
    removeOnComplete: { count: 100, age: 4 * 3600 },
    removeOnFail: { count: 100, age: 24 * 3600 },
  },
})
