import { Queue } from 'bullmq'
import { connection } from './connection'

export interface DocumentExpiryJobData {
  checkAll?: boolean
}

export const documentExpiryQueue = new Queue<DocumentExpiryJobData>('document-expiry', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 500, age: 24 * 3600 },
    removeOnFail: { count: 200, age: 7 * 24 * 3600 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
})
