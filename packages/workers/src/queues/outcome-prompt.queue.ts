import { Queue } from 'bullmq'
import { connection } from './connection'

export const outcomePromptQueue = new Queue('outcome-prompt', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 500, age: 24 * 3600 },
    removeOnFail: { count: 200, age: 7 * 24 * 3600 },
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
  },
})
