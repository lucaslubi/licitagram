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
      removeOnComplete: { count: 500, age: 24 * 3600 },
      removeOnFail: { count: 200, age: 7 * 24 * 3600 },
      attempts: 2,
      backoff: { type: 'exponential', delay: 30000 },
    },
  },
)
