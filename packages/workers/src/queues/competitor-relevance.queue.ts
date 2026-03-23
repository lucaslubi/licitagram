import { Queue } from 'bullmq'
import { connection } from './connection'

export interface CompetitorRelevanceJobData {
  batch?: number
}

export const competitorRelevanceQueue = new Queue<CompetitorRelevanceJobData>(
  'competitor-relevance',
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 500, age: 24 * 3600 },
      removeOnFail: { count: 200, age: 7 * 24 * 3600 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
    },
  },
)
