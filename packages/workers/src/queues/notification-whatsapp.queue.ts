import { Queue } from 'bullmq'
import { connection } from './connection'
import type { FitFlagsSummary } from './notification.queue'

export type WhatsAppNotificationJobData =
  | { matchId: string; whatsappNumber: string; fit_flags_summary?: FitFlagsSummary }
  | { matchId: string; whatsappNumber: string; type: 'outcome_prompt'; tenderObjeto: string; tenderOrgao: string; daysSinceClose: number }

export const whatsappQueue = new Queue<WhatsAppNotificationJobData, unknown, string>('notification-whatsapp', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 10_000 }, // 10s, 20s, 40s, 80s, 160s
    removeOnComplete: { count: 1000, age: 48 * 3600 },
    removeOnFail: { count: 500, age: 14 * 24 * 3600 },
  },
})
