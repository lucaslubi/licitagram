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
      removeOnComplete: 30,
      removeOnFail: 50,
    },
  },
)
