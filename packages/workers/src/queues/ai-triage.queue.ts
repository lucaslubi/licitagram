import { Queue } from 'bullmq'
import { connection } from './connection'

export interface AiTriageJobData {
  companyId: string
  matchIds: string[]
}

export const aiTriageQueue = new Queue<AiTriageJobData, unknown, string>('ai-triage', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 500, age: 24 * 3600 },
    removeOnFail: { count: 200, age: 7 * 24 * 3600 },
  },
})
