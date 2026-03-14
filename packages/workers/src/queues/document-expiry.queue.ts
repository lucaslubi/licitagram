import { Queue } from 'bullmq'
import { connection } from './connection'

export interface DocumentExpiryJobData {
  checkAll?: boolean
}

export const documentExpiryQueue = new Queue<DocumentExpiryJobData>('document-expiry', { connection })
