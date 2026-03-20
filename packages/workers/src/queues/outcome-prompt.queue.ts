import { Queue } from 'bullmq'
import { connection } from './connection'

export const outcomePromptQueue = new Queue('outcome-prompt', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
  },
})
