import { Queue } from 'bullmq'
import { connection } from '../../queues/connection'

export interface PregaoPortalTestJobData {
  credencialId: string
}

export const pregaoPortalTestQueue = new Queue<PregaoPortalTestJobData>('pregao-portal-test-login', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 200, age: 24 * 3600 },
    removeOnFail: { count: 200, age: 7 * 24 * 3600 },
  },
})
