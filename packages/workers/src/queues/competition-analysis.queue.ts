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
      removeOnComplete: 5,
      removeOnFail: 10,
      attempts: 2,
      backoff: { type: 'exponential', delay: 15000 },
    },
  },
)
