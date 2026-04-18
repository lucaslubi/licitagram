import type { Risco } from '@/lib/processos/queries'

const PROB_ORDER = ['baixa', 'media', 'alta'] as const
const IMPACT_ORDER = ['baixo', 'medio', 'alto'] as const

function cellColor(p: string, i: string): string {
  const pi = PROB_ORDER.indexOf(p as typeof PROB_ORDER[number])
  const ii = IMPACT_ORDER.indexOf(i as typeof IMPACT_ORDER[number])
  if (pi < 0 || ii < 0) return 'bg-muted'
  const score = pi + ii // 0 (baixa+baixo) a 4 (alta+alto)
  if (score >= 3) return 'bg-destructive/20 text-destructive border-destructive/40'
  if (score === 2) return 'bg-warning/20 text-warning border-warning/40'
  return 'bg-accent/10 text-accent border-accent/30'
}

export function RiskMatrix({ riscos }: { riscos: Risco[] }) {
  // Agrupa count por célula
  const counts = new Map<string, number>()
  for (const r of riscos) {
    const key = `${r.probabilidade ?? '—'}|${r.impacto ?? '—'}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Distribuição por probabilidade × impacto ({riscos.length} riscos)</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center text-xs">
          <thead>
            <tr>
              <th className="p-2" />
              <th className="p-2 text-muted-foreground">Impacto baixo</th>
              <th className="p-2 text-muted-foreground">Impacto médio</th>
              <th className="p-2 text-muted-foreground">Impacto alto</th>
            </tr>
          </thead>
          <tbody>
            {[...PROB_ORDER].reverse().map((p) => (
              <tr key={p}>
                <th className="p-2 text-left font-medium capitalize text-muted-foreground">Prob. {p}</th>
                {IMPACT_ORDER.map((i) => {
                  const k = `${p}|${i}`
                  const count = counts.get(k) ?? 0
                  return (
                    <td key={i} className={`h-16 w-24 rounded-md border ${cellColor(p, i)}`}>
                      <span className="font-mono text-lg font-semibold">{count}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
