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
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})
