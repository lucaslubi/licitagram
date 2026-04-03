'use client'

import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  ReferenceLine,
} from 'recharts'

const MONTHS_PTBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

interface TrendPoint {
  month: string  // "2025-01"
  count: number
  mean: number
  median: number
  min: number
  max: number
}

interface PriceTrendChartProps {
  points: TrendPoint[]
  direction: 'subindo' | 'estavel' | 'descendo'
  variation_percent: number
  projected_price?: number
  formatCurrency: (value: number) => string
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-')
  const monthIndex = parseInt(m, 10) - 1
  if (monthIndex < 0 || monthIndex > 11) return month
  return `${MONTHS_PTBR[monthIndex]}/${year.slice(2)}`
}

function formatYAxisValue(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `R$ ${Math.round(value / 1_000).toLocaleString('pt-BR')}k`
  return `R$ ${Math.round(value).toLocaleString('pt-BR')}`
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string; dataKey: string }>
  label?: string
  formatCurrency: (value: number) => string
}

function CustomTooltip({ active, payload, label, formatCurrency }: CustomTooltipProps) {
  if (!active || !payload || !label) return null

  return (
    <div className="bg-[#1F2937] border border-[#374151] rounded-lg p-3 shadow-xl">
      <p className="text-white text-xs font-medium mb-2">{formatMonthLabel(label)}</p>
      {payload.map((entry) => {
        if (entry.dataKey === 'range') return null
        const labelMap: Record<string, string> = {
          median: 'Mediana',
          mean: 'Média',
          min: 'Mínimo',
          max: 'Máximo',
        }
        return (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4 text-xs">
            <span className="text-gray-400">{labelMap[entry.dataKey] || entry.dataKey}</span>
            <span className="text-white font-mono">{formatCurrency(entry.value)}</span>
          </div>
        )
      })}
    </div>
  )
}

export function PriceTrendChart({
  points,
  direction,
  variation_percent,
  projected_price,
  formatCurrency,
}: PriceTrendChartProps) {
  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] md:h-[300px] text-gray-400 text-sm">
        Sem dados de tendencia para exibir
      </div>
    )
  }

  // Build chart data with P25-P75 range
  const chartData = points.map((pt) => ({
    month: pt.month,
    monthLabel: formatMonthLabel(pt.month),
    median: pt.median,
    mean: pt.mean,
    min: pt.min,
    max: pt.max,
    count: pt.count,
    // Range array for Area [P25-approx, P75-approx] — we use min/max as proxy for range
    // since the TrendPoint type has min/max but not p25/p75
    rangeLow: pt.min,
    rangeHigh: pt.max,
  }))

  // Add projected point if available
  if (projected_price && points.length > 0) {
    const lastMonth = points[points.length - 1].month
    const [y, m] = lastMonth.split('-').map(Number)
    const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
    chartData.push({
      month: nextMonth,
      monthLabel: formatMonthLabel(nextMonth),
      median: projected_price,
      mean: projected_price,
      min: projected_price,
      max: projected_price,
      count: 0,
      rangeLow: projected_price,
      rangeHigh: projected_price,
    })
  }

  // Badge config
  const badgeConfig = {
    subindo: { color: 'text-red-400 bg-red-900/20 border-red-800/30', icon: '\u25B2', prefix: '+' },
    estavel: { color: 'text-gray-400 bg-gray-900/20 border-gray-700/30', icon: '\u2192', prefix: '\u00B1' },
    descendo: { color: 'text-emerald-400 bg-emerald-900/20 border-emerald-800/30', icon: '\u25BC', prefix: '' },
  }
  const badge = badgeConfig[direction]

  return (
    <div className="relative">
      {/* Direction badge */}
      <div className="absolute top-0 right-0 z-10">
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${badge.color}`}>
          {badge.icon} {badge.prefix}{variation_percent.toFixed(1)}%
        </span>
      </div>

      {/* Chart */}
      <div className="h-[200px] md:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="rangeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F43E01" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#F43E01" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d2f33" />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonthLabel}
              tick={{ fill: '#9CA3AF', fontSize: 11 }}
              axisLine={{ stroke: '#2d2f33' }}
              tickLine={{ stroke: '#2d2f33' }}
            />
            <YAxis
              tickFormatter={formatYAxisValue}
              tick={{ fill: '#9CA3AF', fontSize: 11 }}
              axisLine={{ stroke: '#2d2f33' }}
              tickLine={{ stroke: '#2d2f33' }}
              width={70}
            />
            <Tooltip content={<CustomTooltip formatCurrency={formatCurrency} />} />

            {/* P25-P75 range area */}
            <Area
              type="monotone"
              dataKey="rangeHigh"
              stroke="none"
              fill="url(#rangeGradient)"
              fillOpacity={1}
              name="range"
            />

            {/* Mean line (dashed gray) */}
            <Line
              type="monotone"
              dataKey="mean"
              stroke="#6B7280"
              strokeWidth={1}
              strokeDasharray="5 5"
              dot={false}
              name="mean"
            />

            {/* Median line (brand color, solid) */}
            <Line
              type="monotone"
              dataKey="median"
              stroke="#F43E01"
              strokeWidth={2}
              dot={{ fill: '#F43E01', r: 3, stroke: '#F43E01' }}
              activeDot={{ r: 5, fill: '#F43E01', stroke: '#fff', strokeWidth: 2 }}
              name="median"
              // Make last point dashed if it's the projected one
              strokeOpacity={1}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-3 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#F43E01] inline-block rounded" />
          Mediana
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-gray-500 inline-block rounded border-dashed" style={{ borderTop: '1px dashed #6B7280', height: 0 }} />
          Media
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 inline-block rounded-sm" style={{ backgroundColor: 'rgba(244, 62, 1, 0.1)' }} />
          Min-Max
        </span>
      </div>
    </div>
  )
}
