import { Queue } from 'bullmq'
import { connection } from './connection'

export interface OutboundPersonalizeJobData {
  leadCnpj: string
  leadId?: string | null
  leadRazaoSocial: string
  leadTelefone: string
  leadCnae: string | null
  leadUf: string | null
  leadTotalGanhas: number | null
  leadValorTotal: number | null
  campaignId: string
  template: string
}

export const outboundPersonalizeQueue = new Queue<OutboundPersonalizeJobData, unknown, string>(
  'outbound-personalize',
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { count: 1000, age: 7 * 24 * 3600 },
      removeOnFail: { count: 500, age: 30 * 24 * 3600 },
    },
  },
)
