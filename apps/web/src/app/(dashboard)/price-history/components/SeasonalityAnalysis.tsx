'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SeasonalityAnalysisProps {
  query: string
  uf?: string
  modalidade?: string
}

interface MonthData {
  month: number
  month_name: string
  median_price: number
  volume: number
  price_index: number
}

interface QuarterData {
  quarter: number
  label: string
  median_price: number
  volume: number
  price_index: number
}

interface YearData {
  year: number
  avg_price: number
  volume: number
  variation: number | null
}

interface SeasonalityData {
  monthly: MonthData[]
  quarterly: QuarterData[]
  yearly: YearData[]
  best_months: MonthData[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (n: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)

const formatCurrencyCompact = (n: number): string =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
  }).format(n)

const formatNumber = (n: number): string => n.toLocaleString('pt-BR')

const formatPercent = (n: number): string => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`

function getIndexOpacity(index: number): number {
  return Math.min(0.3, (Math.abs(100 - index) / 100) * 0.3)
}

function getIndexColorClass(index: number): string {
  if (index < 98) return 'bg-emerald-500'
  if (index > 102) return 'bg-red-500'
  return 'bg-gray-500'
}

// ---------------------------------------------------------------------------
// Skeleton components
// ---------------------------------------------------------------------------

function SkeletonBar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#2d2f33] ${className ?? 'h-4 w-full'}`} />
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Monthly heatmap skeleton */}
      <Card className="bg-[#23262a]">
        <CardHeader className="pb-3">
          <SkeletonBar className="h-4 w-40" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-[#2d2f33] p-3 space-y-2">
                <SkeletonBar className="h-3 w-12" />
                <SkeletonBar className="h-5 w-20" />
                <SkeletonBar className="h-3 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Best months skeleton */}
      <Card className="bg-[#23262a]">
        <CardHeader className="pb-3">
          <SkeletonBar className="h-4 w-52" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 overflow-x-auto">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-[#2d2f33] p-4 min-w-[160px] space-y-2">
                <SkeletonBar className="h-4 w-16" />
                <SkeletonBar className="h-5 w-24" />
                <SkeletonBar className="h-3 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quarterly skeleton */}
      <Card className="bg-[#23262a]">
        <CardHeader className="pb-3">
          <SkeletonBar className="h-4 w-44" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-[#2d2f33] p-4 space-y-2">
                <SkeletonBar className="h-4 w-10" />
                <SkeletonBar className="h-5 w-20" />
                <SkeletonBar className="h-3 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* YoY table skeleton */}
      <Card className="bg-[#23262a]">
        <CardHeader className="pb-3">
          <SkeletonBar className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonBar key={i} className="h-8 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SeasonalityAnalysis({
  query,
  uf,
  modalidade,
}: SeasonalityAnalysisProps) {
  const [data, setData] = useState<SeasonalityData | null>(null)
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
      const params = new URLSearchParams({ q: query })
      if (uf) params.set('uf', uf)
      if (modalidade) params.set('modalidade', modalidade)

      const res = await fetch(`/api/price-history/seasonality?${params.toString()}`)

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `Erro ao buscar dados (${res.status})`)
      }

      const json: SeasonalityData = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [query, uf, modalidade])

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
          Nenhum dado de sazonalidade disponivel.
        </CardContent>
      </Card>
    )
  }

  const { monthly, quarterly, yearly, best_months } = data
  const avgIndex = monthly.length > 0
    ? monthly.reduce((sum, m) => sum + m.price_index, 0) / monthly.length
    : 100

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- */}
      {/* 1. Monthly Heatmap                                               */}
      {/* ---------------------------------------------------------------- */}
      {monthly.length > 0 && (
        <Card className="bg-[#23262a]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-300">
              Mapa de Sazonalidade Mensal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {monthly.map((m) => {
                const opacity = getIndexOpacity(m.price_index)
                const colorClass = getIndexColorClass(m.price_index)
                const isBestMonth = best_months.some((bm) => bm.month === m.month)

                return (
                  <div
                    key={m.month}
                    className="relative rounded-lg border border-[#2d2f33] p-3 transition-colors"
                  >
                    {/* Background color overlay */}
                    <div
                      className={`absolute inset-0 rounded-lg ${colorClass}`}
                      style={{ opacity }}
                    />

                    {/* Content */}
                    <div className="relative">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold text-white">
                          {m.month_name}
                        </p>
                        {isBestMonth && (
                          <span
                            className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded"
                            title="Melhor mes para comprar"
                          >
                            ★
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-mono text-white">
                        {formatCurrencyCompact(m.median_price)}
                      </p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-gray-400">
                          {formatNumber(m.volume)} itens
                        </span>
                        <span
                          className={`text-[10px] font-mono ${
                            m.price_index < 100
                              ? 'text-emerald-400'
                              : m.price_index > 100
                                ? 'text-red-400'
                                : 'text-gray-400'
                          }`}
                        >
                          {m.price_index.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 mt-4 text-[10px] text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-emerald-500/30 inline-block" />
                Abaixo da media
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-gray-500/30 inline-block" />
                Na media
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-red-500/30 inline-block" />
                Acima da media
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 2. Best Months to Buy                                            */}
      {/* ---------------------------------------------------------------- */}
      {best_months.length > 0 && (
        <Card className="bg-[#23262a]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-300">
              Melhores Meses para Comprar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {best_months.slice(0, 3).map((m, idx) => {
                const savings = avgIndex > 0 ? ((avgIndex - m.price_index) / avgIndex) * 100 : 0

                return (
                  <div
                    key={m.month}
                    className="flex-shrink-0 min-w-[160px] rounded-lg border border-emerald-800/30 bg-emerald-900/10 p-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg font-bold text-emerald-400">
                        #{idx + 1}
                      </span>
                      <span className="text-sm font-semibold text-white">
                        {m.month_name}
                      </span>
                    </div>
                    <p className="text-sm font-mono text-white">
                      {formatCurrency(m.median_price)}
                    </p>
                    {savings > 0 && (
                      <p className="text-xs text-emerald-400 mt-1.5 font-mono">
                        Economia de {savings.toFixed(1)}%
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 3. Quarterly Summary                                             */}
      {/* ---------------------------------------------------------------- */}
      {quarterly.length > 0 && (
        <Card className="bg-[#23262a]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-300">
              Resumo Trimestral
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {quarterly.map((q) => {
                const opacity = getIndexOpacity(q.price_index)
                const colorClass = getIndexColorClass(q.price_index)

                return (
                  <div
                    key={q.quarter}
                    className="relative rounded-lg border border-[#2d2f33] p-4 transition-colors"
                  >
                    {/* Background color overlay */}
                    <div
                      className={`absolute inset-0 rounded-lg ${colorClass}`}
                      style={{ opacity }}
                    />

                    {/* Content */}
                    <div className="relative">
                      <p className="text-xs font-bold text-white mb-1">
                        {q.label}
                      </p>
                      <p className="text-sm font-mono text-white">
                        {formatCurrencyCompact(q.median_price)}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-gray-400">
                          {formatNumber(q.volume)} itens
                        </span>
                        <span
                          className={`text-[10px] font-mono ${
                            q.price_index < 100
                              ? 'text-emerald-400'
                              : q.price_index > 100
                                ? 'text-red-400'
                                : 'text-gray-400'
                          }`}
                        >
                          {q.price_index.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 4. Year-over-Year Table                                          */}
      {/* ---------------------------------------------------------------- */}
      {yearly.length > 0 && (
        <Card className="bg-[#23262a]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-300">
              Variacao Ano a Ano
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2d2f33]">
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Ano
                    </th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Preço Médio
                    </th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Volume
                    </th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Variacao (%)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {yearly.map((y) => (
                    <tr
                      key={y.year}
                      className="border-b border-[#2d2f33]/50 hover:bg-[#2d2f33]/20 transition-colors"
                    >
                      <td className="py-2.5 px-3 text-white font-medium">
                        {y.year}
                      </td>
                      <td className="py-2.5 px-3 text-right text-white font-mono">
                        {formatCurrency(y.avg_price)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-300 font-mono">
                        {formatNumber(y.volume)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {y.variation !== null ? (
                          <span
                            className={
                              y.variation < 0
                                ? 'text-emerald-400'
                                : y.variation > 0
                                  ? 'text-red-400'
                                  : 'text-gray-400'
                            }
                          >
                            {formatPercent(y.variation)}
                          </span>
                        ) : (
                          <span className="text-gray-500">--</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
