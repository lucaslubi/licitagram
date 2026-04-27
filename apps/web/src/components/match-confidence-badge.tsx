export type ConfidenceLevel = 'high' | 'medium' | 'low'

const CONFIG = {
  high: {
    label: 'Alta confiança',
    icon: '⭐⭐⭐',
    className: 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/30',
    description: 'Engines pgvector e keyword concordam em alta relevância',
  },
  medium: {
    label: 'Média confiança',
    icon: '⭐⭐',
    className: 'bg-amber-500/15 text-amber-700 border border-amber-500/30',
    description: 'Um engine sinaliza forte relevância',
  },
  low: {
    label: 'Baixa confiança',
    icon: '⭐',
    className: 'bg-zinc-500/15 text-zinc-600 border border-zinc-500/30',
    description: 'Match passou no threshold mínimo',
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
