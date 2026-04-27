export type ConfidenceLevel = 'high' | 'medium' | 'low'

// Narrativa cliente: nossa IA Licitagram tem N estrelas de certeza desse match.
// Não expõe detalhes do engine interno (pgvector/keyword/semantic).
const CONFIG = {
  high: {
    label: 'IA: Alta certeza',
    icon: '⭐⭐⭐',
    className: 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/30',
    description: 'Nossa IA Licitagram identificou múltiplos sinais fortes de aderência',
  },
  medium: {
    label: 'IA: Boa certeza',
    icon: '⭐⭐',
    className: 'bg-amber-500/15 text-amber-700 border border-amber-500/30',
    description: 'Nossa IA Licitagram detectou aderência relevante ao seu perfil',
  },
  low: {
    label: 'IA: Vale conferir',
    icon: '⭐',
    className: 'bg-zinc-500/15 text-zinc-600 border border-zinc-500/30',
    description: 'Nossa IA Licitagram sinalizou potencial — vale uma olhada',
  },
} as const

export function MatchConfidenceBadge({
  level,
  compact = false,
}: {
  level: ConfidenceLevel | null | undefined
  compact?: boolean
}) {
  const lvl = (level || 'low') as ConfidenceLevel
  const cfg = CONFIG[lvl]
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md ${cfg.className}`}
      title={cfg.description}
    >
      <span aria-hidden>{cfg.icon}</span>
      {!compact && cfg.label}
    </span>
  )
}
