import { Queue } from 'bullmq'
import { connection } from './connection'

export interface LegadoScrapingJobData {
  pagina?: number
}

export const legadoScrapingQueue = new Queue<LegadoScrapingJobData, unknown, string>(
  'comprasgov-legado',
  {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 15000 },
      removeOnComplete: 20,
      removeOnFail: 50,
    },
  },
)
