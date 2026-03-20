import { Queue } from 'bullmq'
import { connection } from './connection'

export const dailyAuditQueue = new Queue('daily-audit', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 5,
    removeOnFail: 10,
  },
})
