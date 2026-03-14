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
    removeOnComplete: 500,
    removeOnFail: 500,
  },
})
