import { Queue } from 'bullmq'
import { connection } from './connection'

export interface ResultsScrapingJobData {
  batch: number // batch number to process
}

export const resultsScrapingQueue = new Queue<ResultsScrapingJobData>('results-scraping', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
  },
})
