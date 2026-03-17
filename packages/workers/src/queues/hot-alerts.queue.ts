import { Queue } from 'bullmq'
import { connection } from './connection'

export const hotAlertsQueue = new Queue('hot-alerts', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 20,
  },
})
