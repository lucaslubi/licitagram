import { Queue } from 'bullmq'
import { connection } from './connection'

export interface ProactiveSupplierScrapingJobData {
  batch?: number
}

export const proactiveSupplierScrapingQueue = new Queue<ProactiveSupplierScrapingJobData>(
  'proactive-supplier-scraping',
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 100, age: 4 * 3600 },
      removeOnFail: { count: 100, age: 24 * 3600 },
      attempts: 2,
      backoff: { type: 'exponential', delay: 10000 },
    },
  },
)
