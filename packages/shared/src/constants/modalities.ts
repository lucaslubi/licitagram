export const PNCP_MODALITIES: Record<number, string> = {
  1: 'Leilão Eletrônico',
  2: 'Diálogo Competitivo',
  3: 'Concurso',
  4: 'Concorrência Eletrônica',
  5: 'Concorrência Presencial',
  6: 'Pregão Eletrônico',
  7: 'Pregão Presencial',
  8: 'Dispensa de Licitação',
  9: 'Inexigibilidade',
  10: 'Manifestação de Interesse',
  11: 'Pré-qualificação',
  12: 'Credenciamento',
  13: 'Leilão Presencial',
  14: 'Inaplicabilidade',
  15: 'Chamada Pública',
}

export const COMPETITIVE_MODALITIES = [4, 5, 6, 7] as const

/**
 * Modalities excluded from matching — no real competition:
 * 9 = Inexigibilidade (empresa já escolhida, sem competição)
 * 12 = Credenciamento (cadastro, não competição direta)
 * 14 = Inaplicabilidade (sem processo licitatório)
 */
export const NON_COMPETITIVE_MODALITIES = [9, 12, 14] as const

/**
 * Modalities that should NEVER appear as matches or notifications.
 * These are truly non-competitive — impossible to bid on.
 * 9 = Inexigibilidade (supplier already chosen)
 * 14 = Inaplicabilidade (no bidding process)
 */
export const EXCLUDED_MODALITIES = [9, 14] as const

// All modalities worth scraping — full coverage of PNCP
export const ALL_SCRAPING_MODALITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const
