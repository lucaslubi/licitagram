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
    removeOnComplete: { count: 500, age: 24 * 3600 },
    removeOnFail: { count: 200, age: 7 * 24 * 3600 },
  },
})
