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
    removeOnComplete: 100,
    removeOnFail: 100,
  },
})
