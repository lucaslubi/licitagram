import { Queue } from 'bullmq'
import { connection } from './connection'

export interface ARPScrapingJobData {
  pagina?: number
}

export const arpScrapingQueue = new Queue<ARPScrapingJobData, unknown, string>(
  'comprasgov-arp',
  {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 30000 }, // Longer backoff for slow API
      removeOnComplete: { count: 100, age: 4 * 3600 },
      removeOnFail: { count: 100, age: 24 * 3600 },
    },
  },
)
