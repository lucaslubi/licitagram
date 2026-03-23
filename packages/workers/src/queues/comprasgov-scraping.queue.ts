import { Queue } from 'bullmq'
import { connection } from './connection'

export interface ComprasGovScrapingJobData {
  pagina?: number
  uf?: string
  modalidade?: number
  dataInicial?: string // YYYY-MM-DD
  dataFinal?: string   // YYYY-MM-DD
}

export const comprasgovScrapingQueue = new Queue<ComprasGovScrapingJobData, unknown, string>(
  'comprasgov-scraping',
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100, age: 4 * 3600 },
      removeOnFail: { count: 100, age: 24 * 3600 },
    },
  },
)
