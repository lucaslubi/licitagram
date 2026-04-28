import { Queue } from 'bullmq'
import { connection } from './connection'
import type { FitFlagsSummary } from './notification.queue'

export type EmailNotificationJobData =
  | { matchId: string; userEmail: string; userId: string; fit_flags_summary?: FitFlagsSummary }
  | { matchId: string; userEmail: string; userId: string; type: 'hot_alert'; fit_flags_summary?: FitFlagsSummary }
  | { matchId: string; userEmail: string; userId: string; type: 'urgency_digest'; matches: string[] }
  | { userEmail: string; userId: string; type: 'certidao_expiring'; certidaoTipo: string; diasRestantes: number }
  | { userEmail: string; userId: string; type: 'weekly_report'; month: string }
  | { userEmail: string; userId: string; type: 'trial_expiring_soon' }
  | { userEmail: string; userId: string; type: 'trial_expired' }
  | { userId: string; type: 'data_export_ready'; userEmail?: string; jobId: string; signedUrl: string; expiresAt: string }
  | { userId: string; type: 'account_deletion_scheduled'; userEmail?: string; scheduledFor: string; cancelLink: string }
  | { userId: string; type: 'account_deletion_cancelled'; userEmail?: string }

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
