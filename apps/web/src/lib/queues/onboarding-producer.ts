/**
 * Channel onboarding producer (web app side).
 *
 * Enqueues a job into the BullMQ `channel-onboarding` queue consumed by the
 * workers package. The processor decides between TRIAL WOW and BACKFILL.
 */
import { Queue } from 'bullmq'
import IORedis from 'ioredis'

export type ChannelOnboardingChannel = 'whatsapp' | 'telegram' | 'email'

interface OnboardingJobData {
  userId: string
  channel: ChannelOnboardingChannel
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let queue: Queue<any> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getQueue(): Queue<any> {
  if (queue) return queue
  const url = process.env.REDIS_URL
  if (!url) throw new Error('REDIS_URL not set')
  const connection = new IORedis(url, { maxRetriesPerRequest: null })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queue = new Queue('channel-onboarding', { connection: connection as any })
  return queue
}

export async function enqueueChannelOnboarding(
  userId: string,
  channel: ChannelOnboardingChannel,
): Promise<void> {
  const jobId = `onb-${channel}-${userId}`
  await getQueue().add(jobId, { userId, channel }, { jobId })
}
