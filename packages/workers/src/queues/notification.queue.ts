import { Queue } from 'bullmq'
import { connection } from './connection'

export interface UrgencyMatchItem {
  id: string
  score: number
  objeto: string
  orgao: string
  uf: string
  municipio: string
  valor: number
  modalidade: string
  dataEncerramento: string
  numero: string
  ano: string
}

export type NotificationJobData =
  | { matchId: string; telegramChatId?: number; whatsappNumber?: string }
  | { matchId: string; telegramChatId: number; type: 'hot'; rank: number; plan: string; competitionScore: number; topCompetitors: Array<{ nome: string; winRate: number; porte: string }> }
  | { telegramChatId: number; type: 'urgency_48h'; matches: UrgencyMatchItem[]; totalValor: number }
  | { telegramChatId: number; type: 'urgency_24h'; matches: UrgencyMatchItem[]; totalValor: number }
  | { telegramChatId: number; type: 'new_matches'; matches: UrgencyMatchItem[]; totalValor: number }
  | { matchId: string; telegramChatId: number; type: 'outcome_prompt'; tenderObjeto: string; tenderOrgao: string; daysSinceClose: number }

export const notificationQueue = new Queue<NotificationJobData, unknown, string>('notification', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})
