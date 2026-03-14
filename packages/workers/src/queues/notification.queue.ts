import { Queue } from 'bullmq'
import { connection } from './connection'

export interface NotificationJobData {
  matchId: string
  telegramChatId?: number
  whatsappNumber?: string
}

export const notificationQueue = new Queue<NotificationJobData, unknown, string>('notification', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})
