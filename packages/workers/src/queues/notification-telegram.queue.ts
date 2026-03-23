import { Queue } from 'bullmq'
import { connection } from './connection'
import type { NotificationJobData } from './notification.queue'

export const telegramQueue = new Queue<NotificationJobData, unknown, string>('notification-telegram', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 10_000 }, // 10s, 20s, 40s, 80s, 160s
    removeOnComplete: { count: 1000, age: 48 * 3600 },
    removeOnFail: { count: 500, age: 14 * 24 * 3600 },
  },
})
