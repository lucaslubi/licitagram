import { Queue } from 'bullmq'
import { connection } from './connection'

export interface MatchingJobData {
  tenderId: string
  companyId: string
}

export const matchingQueue = new Queue<MatchingJobData, unknown, string>('matching', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 8000 },
    removeOnComplete: 500,
    removeOnFail: 500,
  },
})
