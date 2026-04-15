import { Queue } from 'bullmq'
import { connection } from '../../queues/connection'

export interface PregaoChatClassifyJobData {
  mensagemId: string
}

export const pregaoChatClassifyQueue = new Queue<PregaoChatClassifyJobData>('pregao-chat-classify', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000, age: 48 * 3600 },
    removeOnFail: { count: 500, age: 14 * 24 * 3600 },
  },
})
