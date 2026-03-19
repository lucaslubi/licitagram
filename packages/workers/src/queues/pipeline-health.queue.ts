import { Queue } from 'bullmq'
import { connection } from './connection'

export const pipelineHealthQueue = new Queue('pipeline-health', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 5,
    removeOnFail: 10,
  },
})
