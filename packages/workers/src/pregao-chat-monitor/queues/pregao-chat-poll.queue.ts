import { Queue } from 'bullmq'
import { connection } from '../../queues/connection'

export interface PregaoChatPollJobData {
  pregaoMonitoradoId: string
}

export const pregaoChatPollQueue = new Queue<PregaoChatPollJobData>('pregao-chat-poll', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 500, age: 24 * 3600 },
    removeOnFail: { count: 1000, age: 7 * 24 * 3600 },
  },
})
