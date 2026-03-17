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
  valor: number | null
  modalidade: string | null
  recomendacao: string | null
  lat: number
  lng: number
  isHot: boolean
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

/** Cor baseada no opportunityScore (0-100) */
export function getHeatColor(score: number): string {
  if (score >= 70) return '#10B981'
  if (score >= 55) return '#34D399'
  if (score >= 40) return '#FBBF24'
  if (score >= 25) return '#F97316'
  if (score >= 10) return '#EF4444'
  return '#6B7280'
}

/** Opacidade proporcional ao volume */
export function getHeatOpacity(totalMatches: number, maxMatches: number): number {
  if (maxMatches === 0) return 0.2
  const ratio = totalMatches / maxMatches
  return Math.max(0.3, Math.min(0.9, 0.3 + ratio * 0.6))
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

/** BRL compacto */
export function formatCompactBRL(value: number): string {
  if (value >= 1_000_000_000) return `R$${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `R$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `R$${(value / 1_000).toFixed(0)}K`
  return `R$${value.toFixed(0)}`
}

/** Label de dificuldade */
export function getDifficultyLabel(avgCompetitors: number | null): {
  label: string; color: string; emoji: string
} {
  if (avgCompetitors === null) return { label: 'Sem dados', color: 'gray', emoji: '?' }
  if (avgCompetitors <= 2) return { label: 'Muito Fácil', color: 'green', emoji: 'green' }
  if (avgCompetitors <= 4) return { label: 'Fácil', color: 'emerald', emoji: 'green' }
  if (avgCompetitors <= 7) return { label: 'Moderado', color: 'yellow', emoji: 'yellow' }
  if (avgCompetitors <= 12) return { label: 'Competitivo', color: 'orange', emoji: 'orange' }
  return { label: 'Muito Competitivo', color: 'red', emoji: 'red' }
}
