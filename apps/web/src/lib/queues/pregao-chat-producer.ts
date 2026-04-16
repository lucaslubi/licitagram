/**
 * Pregão chat producers (web app side).
 *
 * Enqueues jobs into BullMQ queues consumed by the workers package:
 *   - pregao-portal-test-login: validates a freshly added credential
 *   - pregao-chat-poll:         polls a pregão chat room (self-scheduling)
 */
import { Queue } from 'bullmq'
import IORedis from 'ioredis'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQueue = Queue<any>

let testLoginQueue: AnyQueue | null = null
let pollQueue: AnyQueue | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let connection: any = null

function getConnection() {
  if (connection) return connection
  const url = process.env.REDIS_URL
  if (!url) throw new Error('REDIS_URL not set')
  connection = new IORedis(url, { maxRetriesPerRequest: null })
  return connection
}

function getTestLoginQueue(): AnyQueue {
  if (testLoginQueue) return testLoginQueue
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  testLoginQueue = new Queue('pregao-portal-test-login', {
    connection: getConnection() as any,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 200, age: 24 * 3600 },
      removeOnFail: { count: 200, age: 7 * 24 * 3600 },
    },
  })
  return testLoginQueue!
}

function getPollQueue(): AnyQueue {
  if (pollQueue) return pollQueue
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pollQueue = new Queue('pregao-chat-poll', {
    connection: getConnection() as any,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 500, age: 24 * 3600 },
      removeOnFail: { count: 1000, age: 7 * 24 * 3600 },
    },
  })
  return pollQueue!
}

/**
 * Enqueue a portal test-login job.
 * Idempotent per credential: re-enqueues overwrite the prior job.
 */
export async function enqueuePregaoPortalTest(credencialId: string): Promise<void> {
  const jobId = `test-login-${credencialId}`
  await getTestLoginQueue().add('test-login', { credencialId }, { jobId })
}

/**
 * Enqueue the first poll for a monitored pregão.
 * Idempotent by deterministic jobId — the worker self-schedules subsequent polls.
 */
export async function enqueuePregaoFirstPoll(
  pregaoMonitoradoId: string,
  delayMs = 0,
): Promise<void> {
  const jobId = `poll-${pregaoMonitoradoId}-first`
  await getPollQueue().add(
    'poll',
    { pregaoMonitoradoId },
    { jobId, delay: delayMs },
  )
}
