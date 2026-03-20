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
      removeOnComplete: 5,
      removeOnFail: 10,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
    },
  },
)
