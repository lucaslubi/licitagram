import { Queue } from 'bullmq'
import { connection } from './connection'

export const mapCacheQueue = new Queue('map-cache', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 20,
  },
})
