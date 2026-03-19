import { Queue } from 'bullmq'
import { connection } from './connection'
import type { NotificationJobData } from './notification.queue'

export const telegramQueue = new Queue<NotificationJobData, unknown, string>('notification-telegram', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})
