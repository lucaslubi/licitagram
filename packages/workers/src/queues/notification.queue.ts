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

export interface WeeklyActionItem {
  id: string
  type: string
  priority: 'urgent' | 'high' | 'normal'
  headline: string
  detail: string
  metrics: Array<{ label: string; value: string }>
  actionLabel: string
  actionHref: string
  deltaText?: string
}

// F-Q5: optional summary of fit/risk flags (CND, capital, valor) attached
// to notification payloads. Counts only — full details rendered in dashboard.
export interface FitFlagsSummary {
  high: number
  medium: number
  low: number
}

export type NotificationJobData =
  | { matchId: string; telegramChatId?: number; whatsappNumber?: string; fit_flags_summary?: FitFlagsSummary }
  | { matchId: string; telegramChatId: number; type: 'hot'; rank: number; plan: string; competitionScore: number; topCompetitors: Array<{ nome: string; winRate: number; porte: string }> }
  | { telegramChatId: number; type: 'urgency_48h'; matches: UrgencyMatchItem[]; totalValor: number }
  | { telegramChatId: number; type: 'urgency_24h'; matches: UrgencyMatchItem[]; totalValor: number }
  | { telegramChatId: number; type: 'new_matches'; matches: UrgencyMatchItem[]; totalValor: number }
  | { matchId: string; telegramChatId: number; type: 'outcome_prompt'; tenderObjeto: string; tenderOrgao: string; daysSinceClose: number }
  | { telegramChatId?: number; whatsappNumber?: string; type: 'weekly_digest'; actions: WeeklyActionItem[]; companyName: string }

// ─── Notification Priority Levels (lower number = higher priority) ────────
export const NOTIFICATION_PRIORITY = {
  CRITICAL: 1,   // Certidão vencendo, sistema down
  SUPER_HOT: 2,  // Super quente matches (score > 85)
  HOT: 3,        // Hot matches (score > 70)
  NORMAL: 5,     // Normal matches
  DIGEST: 8,     // Weekly digest, new-matches summary
} as const

export const notificationQueue = new Queue<NotificationJobData, unknown, string>('notification', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 10_000 }, // 10s, 20s, 40s, 80s, 160s
    removeOnComplete: { count: 1000, age: 48 * 3600 },
    removeOnFail: { count: 500, age: 14 * 24 * 3600 },
  },
})
