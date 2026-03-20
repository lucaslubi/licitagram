import { Queue } from 'bullmq'
import { connection } from './connection'

export interface AiCompetitorClassifierJobData {
  batch?: number
}

export const aiCompetitorClassifierQueue = new Queue<AiCompetitorClassifierJobData>(
  'ai-competitor-classifier',
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: 5,
      removeOnFail: 10,
      attempts: 3,
      backoff: { type: 'exponential', delay: 15000 },
    },
  },
)
