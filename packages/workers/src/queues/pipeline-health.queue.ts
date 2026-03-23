import { Queue } from 'bullmq'
import { connection } from './connection'

export const pipelineHealthQueue = new Queue('pipeline-health', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 500, age: 24 * 3600 },
    removeOnFail: { count: 200, age: 7 * 24 * 3600 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
})
