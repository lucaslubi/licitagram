import { Queue } from 'bullmq'
import { connection } from './connection'

export interface CompetitorRelevanceJobData {
  batch?: number
  /**
   * When set, the processor analyzes ONLY this company and bypasses the
   * 12h "recently analyzed" skip. Used by worker-matching to trigger
   * immediate relevance classification on company insert/update.
   */
  companyId?: string
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
