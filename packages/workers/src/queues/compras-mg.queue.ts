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
      removeOnComplete: { count: 100, age: 4 * 3600 },
      removeOnFail: { count: 100, age: 24 * 3600 },
    },
  },
)
