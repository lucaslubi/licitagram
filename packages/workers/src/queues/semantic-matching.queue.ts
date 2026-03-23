import { Queue } from 'bullmq'
import { connection } from './connection'

export interface SemanticMatchingJobData {
  companyId: string
}

export const semanticMatchingQueue = new Queue<SemanticMatchingJobData, unknown, string>('semantic-matching', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 100, age: 4 * 3600 },
    removeOnFail: { count: 100, age: 24 * 3600 },
  },
})
