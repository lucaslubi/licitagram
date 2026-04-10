import { Queue } from 'bullmq'
import { connection } from './connection'

export const trialExpiryQueue = new Queue(
  'trial-expiry',
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { count: 100, age: 24 * 3600 },
      removeOnFail: { count: 50, age: 7 * 24 * 3600 },
    },
  },
)
