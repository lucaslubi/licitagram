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
      attempts: 2,
      backoff: { type: 'exponential', delay: 10000 },
    },
  },
)
