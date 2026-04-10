import { Queue } from 'bullmq'
import { connection } from './connection'

export type EmailNotificationJobData =
  | { matchId: string; userEmail: string; userId: string }
  | { matchId: string; userEmail: string; userId: string; type: 'hot_alert' }
  | { matchId: string; userEmail: string; userId: string; type: 'urgency_digest'; matches: string[] }
  | { userEmail: string; userId: string; type: 'certidao_expiring'; certidaoTipo: string; diasRestantes: number }
  | { userEmail: string; userId: string; type: 'weekly_report'; month: string }
  | { userEmail: string; userId: string; type: 'trial_expiring_soon' }
  | { userEmail: string; userId: string; type: 'trial_expired' }

export const emailQueue = new Queue<EmailNotificationJobData>(
  'notification-email',
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { count: 1000, age: 48 * 3600 },
      removeOnFail: { count: 500, age: 14 * 24 * 3600 },
    },
  },
)
