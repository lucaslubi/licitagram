export type MatchStatus =
  | 'new'
  | 'notified'
  | 'viewed'
  | 'interested'
  | 'applied'
  | 'won'
  | 'lost'
  | 'dismissed'

export interface MatchBreakdown {
  category: string
  score: number
  reason: string
}

export interface MatchResult {
  score: number
  breakdown: MatchBreakdown[]
  justificativa: string
  recomendacao: 'participar' | 'avaliar_melhor' | 'nao_recomendado'
  riscos: string[]
  acoes_necessarias: string[]
}

export interface Match {
  id: string
  company_id: string
  tender_id: string
  score: number
  breakdown: MatchBreakdown[]
  ai_justificativa: string | null
  status: MatchStatus
  notified_at: string | null
  created_at: string
  updated_at: string
}
