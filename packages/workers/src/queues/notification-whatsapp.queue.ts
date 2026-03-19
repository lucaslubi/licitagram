import { Queue } from 'bullmq'
import { connection } from './connection'

export interface WhatsAppNotificationJobData {
  matchId: string
  whatsappNumber: string
}

export const whatsappQueue = new Queue<WhatsAppNotificationJobData, unknown, string>('notification-whatsapp', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})
