'use client'

// ─── Score Donut ──────────────────────────────────────────────────────────────

export function ScoreDonut({ distribution }: { distribution: { range: string; count: number; color: string; percentage: number }[] }) {
  const total = distribution.reduce((s, d) => s + d.count, 0)
  let cumulativePercent = 0

  const segments = distribution.map(d => {
    const start = cumulativePercent
    const percent = total > 0 ? (d.count / total) * 100 : 0
    cumulativePercent += percent
    return { ...d, start, percent }
  })

  const gradientStops = segments.map(s => `${s.color} ${s.start}% ${s.start + s.percent}%`).join(', ')
  const gradient = total > 0 ? `conic-gradient(${gradientStops})` : 'conic-gradient(rgba(255,255,255,0.06) 0% 100%)'

  return (
    <div className="flex items-center gap-6">
      <div className="relative w-32 h-32 shrink-0">
        <div className="w-full h-full rounded-full" style={{ background: gradient }} />
        <div className="absolute inset-3 bg-[#0a0a0b] rounded-full flex items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-bold text-white font-[family-name:var(--font-geist-mono)] tabular-nums">{total}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">matches</p>
          </div>
        </div>
      </div>
      <div className="space-y-2 flex-1">
        {distribution.map(d => (
          <div key={d.range} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-xs text-gray-500 font-[family-name:var(--font-geist-mono)] w-14">{d.range}</span>
            <span className="text-sm font-semibold text-white font-[family-name:var(--font-geist-mono)] tabular-nums">{d.count}</span>
            <span className="text-xs text-gray-500 font-[family-name:var(--font-geist-mono)]">({total > 0 ? Math.round((d.count / total) * 100) : 0}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── UF Bar Chart — Single brand color with rank-based opacity ────────────────

const RANK_OPACITY = [1.0, 0.75, 0.55, 0.40, 0.28]

export function UFBarChart({ data }: { data: [string, number][] }) {
  const max = Math.max(...data.map(d => d[1]), 1)

  return (
    <div className="space-y-3">
      {data.map(([uf, count], i) => (
        <div key={uf} className="flex items-center gap-3">
          <div className="w-8 text-center">
            <span className="text-xs font-semibold text-gray-400 bg-white/[0.04] px-2 py-1 rounded-md inline-block">{uf}</span>
          </div>
          <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max((count / max) * 100, 8)}%`,
                backgroundColor: `hsl(18 95% 55% / ${RANK_OPACITY[i] ?? 0.2})`,
              }}
            />
          </div>
          <span className="text-xs font-semibold text-white font-[family-name:var(--font-geist-mono)] tabular-nums w-10 text-right">{count}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Modalidade Bar Chart — Single brand color with rank-based opacity ────────

export function ModalidadeBarChart({ data }: { data: [string, number][] }) {
  const max = Math.max(...data.map(d => d[1]), 1)

  return (
    <div className="space-y-3.5">
      {data.map(([mod, count], i) => (
        <div key={mod}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-400 truncate max-w-[220px]">{mod}</span>
            <span className="text-xs font-semibold text-white font-[family-name:var(--font-geist-mono)] tabular-nums ml-2">{count}</span>
          </div>
          <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max((count / max) * 100, 5)}%`,
                backgroundColor: `hsl(18 95% 55% / ${RANK_OPACITY[i] ?? 0.2})`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Document Health — No misleading bar, clean status cards ──────────────────

export function DocumentHealth({ valid, expiring, expired }: { valid: number; expiring: number; expired: number }) {
  const total = valid + expiring + expired

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
        {total} documento{total !== 1 ? 's' : ''} monitorado{total !== 1 ? 's' : ''}
      </p>
      <div className="grid grid-cols-3 gap-px bg-white/[0.06] rounded-lg overflow-hidden">
        <div className="bg-[#131316] p-4 text-center">
          <p className="text-xl font-bold text-emerald-400 font-[family-name:var(--font-geist-mono)] tabular-nums">{valid}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mt-1">Válidos</p>
        </div>
        <div className="bg-[#131316] p-4 text-center">
          <p className="text-xl font-bold text-amber-400 font-[family-name:var(--font-geist-mono)] tabular-nums">{expiring}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mt-1">Vencendo</p>
        </div>
        <div className="bg-[#131316] p-4 text-center">
          <p className="text-xl font-bold text-red-400 font-[family-name:var(--font-geist-mono)] tabular-nums">{expired}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mt-1">Vencidos</p>
        </div>
      </div>
    </div>
  )
}

// ─── Win Rate Circle — Premium ────────────────────────────────────────────────

export function WinRateCircle({ rate, won, lost }: { rate: number; won: number; lost: number }) {
  const circumference = 2 * Math.PI * 40
  const strokeDasharray = `${(rate / 100) * circumference} ${circumference}`
  const color = rate >= 50 ? '#10B981' : '#EF4444'

  return (
    <div className="flex items-center gap-6">
      <div className="relative w-24 h-24 shrink-0" style={{ filter: `drop-shadow(0 0 10px ${color}25)` }}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
          <circle
            cx="50" cy="50" r="40" fill="none"
            stroke={color}
            strokeWidth="7"
            strokeDasharray={strokeDasharray}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-white font-[family-name:var(--font-geist-mono)] tabular-nums">{rate}%</span>
        </div>
      </div>
      <div>
        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">Taxa de Vitória</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-gray-400">{won} ganhas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-xs text-gray-400">{lost} perdidas</span>
          </div>
        </div>
      </div>
    </div>
  )
}
