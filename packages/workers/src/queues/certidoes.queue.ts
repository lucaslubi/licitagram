import { Queue } from 'bullmq'
import { connection } from './connection'

export interface CertidoesJobData {
  companyId?: string
  cnpj?: string
  tipos?: string[]
  forceRefresh?: boolean
}

export const certidoesQueue = new Queue<CertidoesJobData>(
  'certidoes',
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: { age: 86400 },
      removeOnFail: 50,
      attempts: 2,
      backoff: { type: 'exponential', delay: 30000 },
    },
  },
)
