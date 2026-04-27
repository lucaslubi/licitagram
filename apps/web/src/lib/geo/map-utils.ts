/** Dados de um match individual para exibição no mapa */
export interface MatchMarker {
  matchId: string
  tenderId: string
  objeto: string
  orgao: string
  uf: string
  municipio: string | null
  score: number
  matchSource: string
  matchConfidence: 'high' | 'medium' | 'low' | null
  valor: number | null
  modalidade: string | null
  recomendacao: string | null
  lat: number
  lng: number
  isHot: boolean
  competitionScore: number | null
  dataEncerramento: string | null
}

/** Dados agregados por UF */
export interface UfMapData {
  uf: string
  name: string
  region: string
  totalMatches: number
  avgScore: number
  maxScore: number
  highScoreCount: number
  totalValue: number
  avgValue: number
  avgCompetitors: number | null
  lowCompetitionCount: number
  opportunityScore: number
  topTenders: Array<{
    id: string
    matchId: string
    objeto: string
    score: number
    valor: number | null
    orgao: string
    modalidade: string | null
  }>
}

/** OpportunityScore composto para uma UF */
export function calculateUfOpportunityScore(data: {
  avgScore: number
  highScoreCount: number
  totalMatches: number
  avgCompetitors: number | null
  totalValue: number
}): number {
  const scoreComponent = data.avgScore * 0.30
  const volumeComponent = Math.min(100, (data.highScoreCount / Math.max(data.totalMatches, 1)) * 100) * 0.25
  const competitionComponent = data.avgCompetitors !== null
    ? Math.max(0, 100 - data.avgCompetitors * 10) * 0.25
    : 50 * 0.25
  const valueComponent = data.totalValue > 0
    ? Math.min(100, Math.log10(data.totalValue / 10000) * 20) * 0.20
    : 0
  return Math.round(scoreComponent + volumeComponent + competitionComponent + valueComponent)
}

/** @deprecated Import from '@/lib/format' instead */
export { formatCompactBRL } from '@/lib/format'

