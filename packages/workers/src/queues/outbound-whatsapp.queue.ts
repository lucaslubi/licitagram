import { Queue } from 'bullmq'
import { connection } from './connection'

export interface OutboundWhatsappJobData {
  outboundMessageId: string
}

export const outboundWhatsappQueue = new Queue<OutboundWhatsappJobData, unknown, string>(
  'outbound-whatsapp',
  {
    connection,
    defaultJobOptions: {
      attempts: 4,
      backoff: { type: 'exponential', delay: 60_000 }, // 60s, 120s, 240s
      removeOnComplete: { count: 2000, age: 14 * 24 * 3600 },
      removeOnFail: { count: 1000, age: 30 * 24 * 3600 },
    },
  },
)
