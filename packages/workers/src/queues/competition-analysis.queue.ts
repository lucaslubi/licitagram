import { Queue } from 'bullmq'
import { connection } from './connection'

export interface CompetitionAnalysisJobData {
  mode: 'full' | 'incremental'
}

export const competitionAnalysisQueue = new Queue<CompetitionAnalysisJobData>(
  'competition-analysis',
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 500, age: 24 * 3600 },
      removeOnFail: { count: 200, age: 7 * 24 * 3600 },
      attempts: 2,
      backoff: { type: 'exponential', delay: 15000 },
    },
  },
)
