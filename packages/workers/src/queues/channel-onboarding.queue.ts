import { Queue } from 'bullmq'
import { connection } from './connection'

export type ChannelOnboardingChannel = 'whatsapp' | 'telegram' | 'email'

export interface ChannelOnboardingJobData {
  userId: string
  channel: ChannelOnboardingChannel
}

/**
 * Channel onboarding queue.
 *
 * Triggered when a user activates a notification channel for the first time
 * (WhatsApp verified, Telegram /start, email enabled, etc.).
 *
 * The processor decides between two flows:
 * - **TRIAL WOW**: company never received any notification → send a big batch (up to 50)
 *   of fresh quality matches to create a strong first impression.
 * - **BACKFILL**: company already received notifications on another channel → resend the
 *   full history of already-notified matches to the new channel so the client has
 *   continuity.
 */
export const channelOnboardingQueue = new Queue<ChannelOnboardingJobData, unknown, string>(
  'channel-onboarding',
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { count: 500, age: 7 * 24 * 3600 },
      removeOnFail: { count: 200, age: 14 * 24 * 3600 },
    },
  },
)
