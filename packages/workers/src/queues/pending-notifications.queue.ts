import { Queue } from 'bullmq'
import { connection } from './connection'

export const pendingNotificationsQueue = new Queue('pending-notifications', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 20,
  },
})
