/**
 * Data export producer (web app side).
 *
 * Enqueues a job into the BullMQ `data-export` queue consumed by the
 * workers package. Worker generates ZIP, uploads to Supabase Storage
 * and notifies the user via email.
 */
import { Queue } from 'bullmq'
import IORedis from 'ioredis'

interface DataExportJobData {
  jobId: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let queue: Queue<any> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getQueue(): Queue<any> {
  if (queue) return queue
  const url = process.env.REDIS_URL
  if (!url) throw new Error('REDIS_URL not set')
  const connection = new IORedis(url, {
    maxRetriesPerRequest: null,
    ...(url.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queue = new Queue('data-export', { connection: connection as any })
  return queue
}

export async function enqueueDataExport(jobId: string): Promise<void> {
  const data: DataExportJobData = { jobId }
  await getQueue().add(`export-${jobId}`, data, { jobId: `export-${jobId}` })
}
