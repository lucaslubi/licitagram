/**
 * Email notification producer (web app side).
 *
 * Thin wrapper around the BullMQ `notification-email` queue, so server
 * actions can enqueue transactional emails (account deletion, restored,
 * data export ready, etc.) without importing the workers package.
 *
 * Lazy Redis connection module-scoped — reused across calls.
 */
import { Queue } from 'bullmq'
import IORedis from 'ioredis'

// Mirror of EmailNotificationJobData from packages/workers — keep in sync.
type EmailJobData =
  | { userId: string; type: 'account_deletion_scheduled'; userEmail?: string; scheduledFor: string; cancelLink: string }
  | { userId: string; type: 'account_deletion_cancelled'; userEmail?: string }
  | { userId: string; type: 'data_export_ready'; userEmail?: string; jobId: string; signedUrl: string; expiresAt: string }

let _queue: Queue<EmailJobData> | null = null

function getQueue(): Queue<EmailJobData> {
  if (_queue) return _queue
  const url = process.env.REDIS_URL
  if (!url) throw new Error('REDIS_URL not set')
  const connection = new IORedis(url, {
    maxRetriesPerRequest: null,
    ...(url.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
  })
  _queue = new Queue<EmailJobData>('notification-email', {
    connection: connection as unknown as import('bullmq').ConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { count: 1000, age: 48 * 3600 },
      removeOnFail: { count: 500, age: 14 * 24 * 3600 },
    },
  })
  return _queue
}

export async function enqueueAccountDeletionScheduled(args: {
  userId: string
  userEmail?: string
  scheduledFor: string
  cancelLink: string
}): Promise<void> {
  await getQueue().add(
    `account-deletion-scheduled-${args.userId}`,
    { type: 'account_deletion_scheduled', ...args },
    { jobId: `account-deletion-scheduled-${args.userId}-${Date.parse(args.scheduledFor) || Date.now()}` },
  )
}

export async function enqueueAccountDeletionCancelled(args: {
  userId: string
  userEmail?: string
}): Promise<void> {
  await getQueue().add(
    `account-deletion-cancelled-${args.userId}`,
    { type: 'account_deletion_cancelled', ...args },
    { jobId: `account-deletion-cancelled-${args.userId}-${Date.now()}` },
  )
}
