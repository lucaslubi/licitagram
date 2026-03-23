import { Queue } from 'bullmq'
import { connection } from './connection'

export interface ScrapingJobData {
  modalidadeId: number
  dataInicial: string
  dataFinal: string
  pagina: number
  uf?: string
}

export const scrapingQueue = new Queue<ScrapingJobData, unknown, string>('scraping', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100, age: 4 * 3600 },
    removeOnFail: { count: 100, age: 24 * 3600 },
  },
})
