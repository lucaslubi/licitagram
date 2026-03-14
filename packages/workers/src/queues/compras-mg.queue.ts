import { Queue } from 'bullmq'
import { connection } from './connection'

export interface MGScrapingJobData {
  tipo?: 'pregao' | 'concorrencia' | 'all'
}

export const mgScrapingQueue = new Queue<MGScrapingJobData, unknown, string>(
  'compras-mg',
  {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 20000 },
      removeOnComplete: 20,
      removeOnFail: 50,
    },
  },
)
