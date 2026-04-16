/**
 * Badge visual para modalidade de licitação.
 * Cores diferenciadas por tipo para rápida identificação.
 */

const MODALIDADE_COLORS: Record<number, { bg: string; text: string; label: string }> = {
  1:  { bg: 'bg-amber-500/10',   text: 'text-amber-600',   label: 'Leilão Eletrônico' },
  2:  { bg: 'bg-violet-500/10',  text: 'text-violet-600',  label: 'Diálogo Competitivo' },
  3:  { bg: 'bg-pink-500/10',    text: 'text-pink-600',    label: 'Concurso' },
  4:  { bg: 'bg-blue-500/10',    text: 'text-blue-600',    label: 'Concorrência' },
  5:  { bg: 'bg-blue-500/10',    text: 'text-blue-600',    label: 'Concorrência Presencial' },
  6:  { bg: 'bg-emerald-500/10', text: 'text-emerald-600', label: 'Pregão Eletrônico' },
  7:  { bg: 'bg-emerald-500/10', text: 'text-emerald-600', label: 'Pregão Presencial' },
  8:  { bg: 'bg-orange-500/10',  text: 'text-orange-600',  label: 'Dispensa' },
  9:  { bg: 'bg-gray-500/10',    text: 'text-gray-500',    label: 'Inexigibilidade' },
  10: { bg: 'bg-cyan-500/10',    text: 'text-cyan-600',    label: 'Manif. Interesse' },
  11: { bg: 'bg-indigo-500/10',  text: 'text-indigo-600',  label: 'Pré-qualificação' },
  12: { bg: 'bg-gray-500/10',    text: 'text-gray-500',    label: 'Credenciamento' },
  13: { bg: 'bg-amber-500/10',   text: 'text-amber-600',   label: 'Leilão Presencial' },
  14: { bg: 'bg-gray-400/10',    text: 'text-gray-400',    label: 'Inaplicabilidade' },
  15: { bg: 'bg-teal-500/10',    text: 'text-teal-600',    label: 'Chamada Pública' },
}

const FALLBACK = { bg: 'bg-foreground/5', text: 'text-muted-foreground', label: '' }

interface ModalidadeBadgeProps {
  modalidadeId?: number | null
  modalidadeNome?: string | null
  compact?: boolean
}

export function ModalidadeBadge({ modalidadeId, modalidadeNome, compact = false }: ModalidadeBadgeProps) {
  if (!modalidadeId && !modalidadeNome) return null

  const config = (modalidadeId ? MODALIDADE_COLORS[modalidadeId] : null) || FALLBACK
  const label = compact
    ? (config.label || modalidadeNome || '')
    : (modalidadeNome || config.label || '')

  if (!label) return null

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${config.bg} ${config.text}`}>
      {label}
    </span>
  )
}
