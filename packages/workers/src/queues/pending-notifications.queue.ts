import { Queue } from 'bullmq'
import { connection } from './connection'

export const pendingNotificationsQueue = new Queue('pending-notifications', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 1000, age: 48 * 3600 },
    removeOnFail: { count: 500, age: 14 * 24 * 3600 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
})
