import { Queue } from 'bullmq'
import { connection } from './connection'

export interface ContactEnrichmentJobData {
  batch: number
}

export const contactEnrichmentQueue = new Queue<ContactEnrichmentJobData>('contact-enrichment', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100, age: 4 * 3600 },
    removeOnFail: { count: 100, age: 24 * 3600 },
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
  },
})
