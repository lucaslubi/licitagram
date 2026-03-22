import { Queue } from 'bullmq'
import { connection } from './connection'

export const aiHealingQueue = new Queue('ai-healing', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 5,
    removeOnFail: 10,
  },
})
