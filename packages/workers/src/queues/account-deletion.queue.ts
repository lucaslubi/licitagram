import { Queue } from 'bullmq'
import { connection } from './connection'

export const accountDeletionQueue = new Queue('account-deletion', {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 60, age: 30 * 24 * 3600 },
    removeOnFail: { count: 60, age: 30 * 24 * 3600 },
  },
})
