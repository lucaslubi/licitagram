import { Queue } from 'bullmq'
import { connection } from './connection'

export type WhatsAppNotificationJobData =
  | { matchId: string; whatsappNumber: string }
  | { matchId: string; whatsappNumber: string; type: 'outcome_prompt'; tenderObjeto: string; tenderOrgao: string; daysSinceClose: number }

export const whatsappQueue = new Queue<WhatsAppNotificationJobData, unknown, string>('notification-whatsapp', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})
