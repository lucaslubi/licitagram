import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react'
import { type FitFlag, flagToMessage } from '@/lib/match/fit-flags'

const ICON = {
  high: AlertTriangle,
  medium: AlertCircle,
  low: Info,
}

const STYLE = {
  high: 'bg-red-500/10 border-red-500/30 text-red-400',
  medium: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  low: 'bg-zinc-500/10 border-zinc-500/30 text-muted-foreground',
}

export function MatchFitFlags({
  flags,
  fit_score,
}: {
  flags: FitFlag[]
  fit_score: number
}) {
  if (flags.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[13px]">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>Você atende aos requisitos básicos pra essa licitação</span>
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Alertas de aderência</span>
        <span>
          Fit-score:{' '}
          <span className="font-medium text-foreground font-mono tabular-nums">
            {fit_score}/100
          </span>
        </span>
      </div>
      {flags.map((f, i) => {
        const Icon = ICON[f.severity]
        return (
          <div
            key={i}
            className={`flex items-start gap-2 px-3 py-2 rounded-md border text-[13px] ${STYLE[f.severity]}`}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{flagToMessage(f)}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Badge compacto pra lista — "⚠ N alertas" */
export function MatchFitFlagsBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
      <AlertTriangle className="w-3 h-3" />
      {count} alerta{count !== 1 ? 's' : ''}
    </span>
  )
}
