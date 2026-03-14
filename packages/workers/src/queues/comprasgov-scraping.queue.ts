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
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  },
)
