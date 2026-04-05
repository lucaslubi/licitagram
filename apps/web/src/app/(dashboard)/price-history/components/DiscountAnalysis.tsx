'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiscountAnalysisProps {
  query: string
  uf?: string
  modalidade?: string
  dateFrom?: string
  dateTo?: string
}

interface HistogramBucket {
  label: string
  count: number
  from: number
  to: number
}

interface WinnerLoserStats {
  mean: number
  median: number
}

interface ByUFEntry {
  uf: string
  median_discount: number
  count: number
}

interface ByPorteEntry {
  porte: string
  median_discount: number
  count: number
}

interface TrendPoint {
  month: string
  median_discount: number
  count: number
}

interface DiscountData {
  summary: {
    mean: number
    median: number
    std_dev: number
    total: number
  }
  histogram: HistogramBucket[]
  winner_vs_loser: {
    winners: WinnerLoserStats
    losers: WinnerLoserStats
  }
  by_uf: ByUFEntry[]
  by_porte: ByPorteEntry[]
  trend: TrendPoint[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTHS_PTBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`
}

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR')
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-')
  const monthIndex = parseInt(m, 10) - 1
  if (monthIndex < 0 || monthIndex > 11) return month
  return `${MONTHS_PTBR[monthIndex]}/${year.slice(2)}`
}

/** Returns a color between red and emerald based on discount value. */
function discountColor(discount: number): string {
  if (discount >= 30) return '#10b981' // emerald-500
  if (discount >= 20) return '#34d399' // emerald-400
  if (discount >= 10) return '#6ee7b7' // emerald-300
  if (discount >= 5) return '#a7f3d0'  // emerald-200
  if (discount >= 0) return '#fbbf24'  // amber-400
  if (discount >= -5) return '#f97316' // orange-500
  return '#ef4444' // red-500
}

function discountBgOpacity(discount: number): string {
  const abs = Math.abs(discount)
  if (abs >= 30) return '0.35'
  if (abs >= 20) return '0.28'
  if (abs >= 10) return '0.2'
  return '0.12'
}

/** Map histogram bucket range to a gradient color. */
function bucketColor(from: number): string {
  if (from >= 30) return '#10b981'
  if (from >= 20) return '#34d399'
  if (from >= 10) return '#6ee7b7'
  if (from >= 0) return '#fbbf24'
  if (from >= -10) return '#f97316'
  return '#ef4444'
}

// ---------------------------------------------------------------------------
// Skeleton components
// ---------------------------------------------------------------------------

function SkeletonBar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#2d2f33] ${className ?? 'h-4 w-full'}`} />
}

function SkeletonStatCard() {
  return (
    <Card className="bg-[#23262a]">
      <CardContent className="p-4">
        <SkeletonBar className="h-3 w-20 mb-2" />
        <SkeletonBar className="h-7 w-24" />
      </CardContent>
    </Card>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
      <Card className="bg-[#23262a]">
        <CardContent className="p-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBar key={i} className="h-6 w-full" />
          ))}
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-[#23262a]">
          <CardContent className="p-6">
            <SkeletonBar className="h-40 w-full" />
          </CardContent>
        </Card>
        <Card className="bg-[#23262a]">
          <CardContent className="p-6">
            <SkeletonBar className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tooltip for trend chart
// ---------------------------------------------------------------------------

interface TrendTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; dataKey: string }>
  label?: string
}

function TrendTooltip({ active, payload, label }: TrendTooltipProps) {
  if (!active || !payload || !label) return null
  return (
    <div className="bg-[#1F2937] border border-[#374151] rounded-lg p-3 shadow-xl">
      <p className="text-white text-xs font-medium mb-2">{formatMonthLabel(label)}</p>
      {payload.map((entry) => {
        if (entry.dataKey === 'areaFill') return null
        return (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4 text-xs">
            <span className="text-gray-400">Desconto Mediano</span>
            <span className="text-white font-mono">{formatPercent(entry.value)}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DiscountAnalysis({
  query,
  uf,
  modalidade,
  dateFrom,
  dateTo,
}: DiscountAnalysisProps) {
  const [data, setData] = useState<DiscountData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!query.trim()) {
      setData(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ query })
      if (uf) params.set('uf', uf)
      if (modalidade) params.set('modalidade', modalidade)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)

      const res = await fetch(`/api/price-history/discount-analysis?${params.toString()}`)

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `Erro ao buscar dados (${res.status})`)
      }

      const json: DiscountData = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [query, uf, modalidade, dateFrom, dateTo])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // --- Loading ---
  if (loading) {
    return <LoadingSkeleton />
  }

  // --- Error ---
  if (error) {
    return (
      <Card className="bg-[#23262a]">
        <CardContent className="p-6 text-center">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={fetchData}
            className="mt-3 text-xs text-[#F43E01] hover:underline"
          >
            Tentar novamente
          </button>
        </CardContent>
      </Card>
    )
  }

  // --- No data ---
  if (!data) {
    return (
      <Card className="bg-[#23262a]">
        <CardContent className="p-6 text-center text-gray-400 text-sm">
          Nenhum dado de desconto disponivel.
        </CardContent>
      </Card>
    )
  }

  const { summary, histogram, winner_vs_loser, by_uf, by_porte, trend } = data
  const maxBucketCount = Math.max(...histogram.map((b) => b.count), 1)

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- */}
      {/* 1. Summary Stats Row                                             */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Desconto Médio" value={formatPercent(summary.mean)} />
        <StatCard label="Desconto Mediano" value={formatPercent(summary.median)} />
        <StatCard label="Total Registros" value={formatNumber(summary.total)} />
        <StatCard label="Desvio Padrão" value={formatPercent(summary.std_dev)} />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 2. Histogram                                                     */}
      {/* ---------------------------------------------------------------- */}
      {histogram.length > 0 && (
        <Card className="bg-[#23262a]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-300">
              Distribuicao de Descontos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {histogram.map((bucket) => {
              const pct = (bucket.count / maxBucketCount) * 100
              return (
                <div key={bucket.label} className="flex items-center gap-3 text-xs">
                  <span className="w-16 text-right text-gray-400 shrink-0 font-mono">
                    {bucket.label}
                  </span>
                  <div className="flex-1 h-5 bg-[#1a1c1f] rounded overflow-hidden">
                    <div
                      className="h-full rounded transition-all duration-500"
                      style={{
                        width: `${Math.max(pct, 1)}%`,
                        backgroundColor: bucketColor(bucket.from),
                      }}
                    />
                  </div>
                  <span className="w-12 text-right text-gray-300 shrink-0 font-mono">
                    {formatNumber(bucket.count)}
                  </span>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 3. Winner vs Loser Comparison                                    */}
      {/* ---------------------------------------------------------------- */}
      {winner_vs_loser && (
        <Card className="bg-[#23262a]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-300">
              Vencedores vs Perdedores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Winners */}
              <div className="rounded-lg border border-emerald-800/30 bg-emerald-900/10 p-4">
                <p className="text-xs text-emerald-400 font-medium mb-3 uppercase tracking-wider">
                  Vencedores
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Media</span>
                    <span className="text-white font-mono">
                      {formatPercent(winner_vs_loser.winners.mean)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Mediana</span>
                    <span className="text-white font-mono">
                      {formatPercent(winner_vs_loser.winners.median)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Losers */}
              <div className="rounded-lg border border-red-800/30 bg-red-900/10 p-4">
                <p className="text-xs text-red-400 font-medium mb-3 uppercase tracking-wider">
                  Perdedores
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Media</span>
                    <span className="text-white font-mono">
                      {formatPercent(winner_vs_loser.losers.mean)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Mediana</span>
                    <span className="text-white font-mono">
                      {formatPercent(winner_vs_loser.losers.median)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Difference bar */}
            <div className="mt-4">
              <p className="text-xs text-gray-400 mb-1.5">
                Diferenca (Vencedor - Perdedor)
              </p>
              <div className="h-3 bg-[#1a1c1f] rounded-full overflow-hidden relative">
                {(() => {
                  const diff =
                    winner_vs_loser.winners.median - winner_vs_loser.losers.median
                  const absDiff = Math.abs(diff)
                  const barWidth = Math.min(absDiff * 2, 100)
                  return (
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(barWidth, 4)}%`,
                        backgroundColor: diff >= 0 ? '#10b981' : '#ef4444',
                      }}
                    />
                  )
                })()}
              </div>
              <p className="text-xs text-gray-300 font-mono mt-1">
                {formatPercent(
                  winner_vs_loser.winners.median - winner_vs_loser.losers.median
                )}{' '}
                p.p.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 4. By UF Heatmap                                                 */}
      {/* ---------------------------------------------------------------- */}
      {by_uf.length > 0 && (
        <Card className="bg-[#23262a]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-300">
              Desconto por UF
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-2">
              {by_uf.map((entry) => {
                const color = discountColor(entry.median_discount)
                const opacity = discountBgOpacity(entry.median_discount)
                return (
                  <div
                    key={entry.uf}
                    className="rounded-lg p-2.5 text-center border border-[#2d2f33] transition-colors"
                    style={{ backgroundColor: `${color}${Math.round(parseFloat(opacity) * 255).toString(16).padStart(2, '0')}` }}
                  >
                    <p className="text-xs font-bold text-white">{entry.uf}</p>
                    <p className="text-xs font-mono text-gray-200 mt-0.5">
                      {formatPercent(entry.median_discount)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {formatNumber(entry.count)}
                    </p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 5. By Porte Breakdown                                            */}
      {/* ---------------------------------------------------------------- */}
      {by_porte.length > 0 && (
        <Card className="bg-[#23262a]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-300">
              Desconto por Porte da Empresa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {by_porte.map((entry) => {
              const maxDiscount = Math.max(...by_porte.map((p) => Math.abs(p.median_discount)), 1)
              const barWidth = (Math.abs(entry.median_discount) / maxDiscount) * 100
              return (
                <div key={entry.porte} className="flex items-center gap-3 text-sm">
                  <span className="w-20 text-gray-400 shrink-0">{entry.porte}</span>
                  <div className="flex-1 h-6 bg-[#1a1c1f] rounded overflow-hidden">
                    <div
                      className="h-full rounded transition-all duration-500 flex items-center px-2"
                      style={{
                        width: `${Math.max(barWidth, 3)}%`,
                        backgroundColor: discountColor(entry.median_discount),
                      }}
                    >
                      <span className="text-[10px] text-white font-mono whitespace-nowrap">
                        {formatPercent(entry.median_discount)}
                      </span>
                    </div>
                  </div>
                  <span className="w-14 text-right text-gray-400 text-xs shrink-0 font-mono">
                    {formatNumber(entry.count)}
                  </span>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 6. Discount Trend                                                */}
      {/* ---------------------------------------------------------------- */}
      {trend.length > 0 && (
        <Card className="bg-[#23262a]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-300">
              Tendência de Desconto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px] md:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={trend.map((pt) => ({
                    month: pt.month,
                    median_discount: pt.median_discount,
                    count: pt.count,
                  }))}
                  margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="discountAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F43E01" stopOpacity={0.2} />
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
                    tickFormatter={(v: number) => `${v}%`}
                    tick={{ fill: '#9CA3AF', fontSize: 11 }}
                    axisLine={{ stroke: '#2d2f33' }}
                    tickLine={{ stroke: '#2d2f33' }}
                    width={50}
                  />
                  <Tooltip content={<TrendTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="median_discount"
                    stroke="none"
                    fill="url(#discountAreaGradient)"
                    fillOpacity={1}
                    name="areaFill"
                  />
                  <Line
                    type="monotone"
                    dataKey="median_discount"
                    stroke="#F43E01"
                    strokeWidth={2}
                    dot={{ fill: '#F43E01', r: 3, stroke: '#F43E01' }}
                    activeDot={{ r: 5, fill: '#F43E01', stroke: '#fff', strokeWidth: 2 }}
                    name="median_discount"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 mt-3 text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-[#F43E01] inline-block rounded" />
                Desconto Mediano
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 inline-block rounded-sm"
                  style={{ backgroundColor: 'rgba(244, 62, 1, 0.15)' }}
                />
                Area
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Internal sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="bg-[#23262a]">
      <CardContent className="p-4">
        <p className="text-xs text-gray-400 mb-1">{label}</p>
        <p className="text-xl font-semibold text-white font-mono">{value}</p>
      </CardContent>
    </Card>
  )
}
