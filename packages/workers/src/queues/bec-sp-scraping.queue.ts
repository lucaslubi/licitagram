import { Queue } from 'bullmq'
import { connection } from './connection'

export interface BecSpScrapingJobData {
  tipo: 'pregao' | 'dispensa' | 'oferta_compra'
}

export const becSpScrapingQueue = new Queue<BecSpScrapingJobData, unknown, string>(
  'bec-sp-scraping',
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
      removeOnComplete: { count: 100, age: 4 * 3600 },
      removeOnFail: { count: 100, age: 24 * 3600 },
    },
  },
)
