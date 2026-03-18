import { Queue } from 'bullmq'
import { connection } from './connection'

export interface ContactEnrichmentJobData {
  batch: number
}

export const contactEnrichmentQueue = new Queue<ContactEnrichmentJobData>('contact-enrichment', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
  },
})
