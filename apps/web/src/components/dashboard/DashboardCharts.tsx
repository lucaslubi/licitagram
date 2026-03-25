'use client'

export function ScoreDonut({ distribution }: { distribution: { range: string; count: number; color: string; percentage: number }[] }) {
  const total = distribution.reduce((s, d) => s + d.count, 0)
  let cumulativePercent = 0

  const segments = distribution.map(d => {
    const start = cumulativePercent
    const percent = total > 0 ? (d.count / total) * 100 : 0
    cumulativePercent += percent
    return { ...d, start, percent }
  })

  // Build conic-gradient
  const gradientStops = segments.map(s => `${s.color} ${s.start}% ${s.start + s.percent}%`).join(', ')
  const gradient = total > 0 ? `conic-gradient(${gradientStops})` : 'conic-gradient(#e5e7eb 0% 100%)'

  return (
    <div className="flex items-center gap-6">
      <div className="relative w-32 h-32 shrink-0">
        <div className="w-full h-full rounded-full" style={{ background: gradient }} />
        <div className="absolute inset-3 bg-white rounded-full flex items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{total}</p>
            <p className="text-[10px] text-gray-400">matches</p>
          </div>
        </div>
      </div>
      <div className="space-y-2 flex-1">
        {distribution.map(d => (
          <div key={d.range} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-sm text-gray-600 font-mono w-14">{d.range}</span>
            <span className="text-sm font-semibold text-gray-900">{d.count}</span>
            <span className="text-xs text-gray-400">({total > 0 ? Math.round((d.count / total) * 100) : 0}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function UFBarChart({ data }: { data: [string, number][] }) {
  const max = Math.max(...data.map(d => d[1]), 1)
  const colors = ['#F43E01', '#F97316', '#FBBF24', '#34D399', '#6366F1']

  return (
    <div className="space-y-3">
      {data.map(([uf, count], i) => (
        <div key={uf} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: colors[i % colors.length] }}>
            {uf}
          </div>
          <div className="flex-1">
            <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full flex items-center px-3 transition-all duration-500"
                style={{ width: `${Math.max((count / max) * 100, 15)}%`, backgroundColor: colors[i % colors.length] + '20' }}
              >
                <span className="text-xs font-semibold" style={{ color: colors[i % colors.length] }}>{count}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function ModalidadeBarChart({ data }: { data: [string, number][] }) {
  const max = Math.max(...data.map(d => d[1]), 1)

  return (
    <div className="space-y-3">
      {data.map(([mod, count]) => (
        <div key={mod}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-600 truncate max-w-[200px]">{mod}</span>
            <span className="text-sm font-semibold text-gray-900 ml-2">{count}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#F43E01] to-[#F97316] rounded-full transition-all duration-500"
              style={{ width: `${Math.max((count / max) * 100, 5)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function DocumentHealth({ valid, expiring, expired }: { valid: number; expiring: number; expired: number }) {
  const total = valid + expiring + expired

  return (
    <div>
      <div className="flex items-center gap-1 mb-4 h-3 rounded-full overflow-hidden bg-gray-100">
        {valid > 0 && <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(valid / Math.max(total, 1)) * 100}%` }} />}
        {expiring > 0 && <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(expiring / Math.max(total, 1)) * 100}%` }} />}
        {expired > 0 && <div className="h-full bg-red-400 rounded-full" style={{ width: `${(expired / Math.max(total, 1)) * 100}%` }} />}
      </div>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="p-3 bg-emerald-50 rounded-xl">
          <p className="text-2xl font-bold text-emerald-600">{valid}</p>
          <p className="text-xs text-emerald-500 font-medium">Validos</p>
        </div>
        <div className="p-3 bg-amber-50 rounded-xl">
          <p className="text-2xl font-bold text-amber-500">{expiring}</p>
          <p className="text-xs text-amber-500 font-medium">Vencendo</p>
        </div>
        <div className="p-3 bg-red-50 rounded-xl">
          <p className="text-2xl font-bold text-red-500">{expired}</p>
          <p className="text-xs text-red-400 font-medium">Vencidos</p>
        </div>
      </div>
    </div>
  )
}

export function WinRateCircle({ rate, won, lost }: { rate: number; won: number; lost: number }) {
  const circumference = 2 * Math.PI * 45
  const strokeDasharray = `${(rate / 100) * circumference} ${circumference}`

  return (
    <div className="flex items-center gap-6">
      <div className="relative w-28 h-28 shrink-0">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="#f3f4f6" strokeWidth="8" />
          <circle cx="50" cy="50" r="45" fill="none" stroke={rate >= 50 ? '#10B981' : '#F43E01'} strokeWidth="8" strokeDasharray={strokeDasharray} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-gray-900">{rate}%</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900 mb-2">Taxa de Vitoria</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm text-gray-600">{won} ganhas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-sm text-gray-600">{lost} perdidas</span>
          </div>
        </div>
      </div>
    </div>
  )
}
