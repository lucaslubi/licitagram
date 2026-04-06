import { Queue } from 'bullmq'
import { connection } from './connection'

export const weeklyActionsQueue = new Queue('weekly-actions', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100, age: 7 * 24 * 3600 },
    removeOnFail: { count: 50, age: 14 * 24 * 3600 },
    attempts: 2,
    backoff: { type: 'exponential', delay: 30_000 },
  },
})
