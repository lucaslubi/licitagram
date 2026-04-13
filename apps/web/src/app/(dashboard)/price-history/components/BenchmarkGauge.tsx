'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatCurrencyBR as formatBRL, formatDateShort, formatInputBRL } from '@/lib/format'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BenchmarkGaugeProps {
  query: string
  uf?: string
  modalidade?: string
  dateFrom?: string
  dateTo?: string
}

type Rating =
  | 'muito_competitivo'
  | 'competitivo'
  | 'na_media'
  | 'acima_da_media'
  | 'nao_competitivo'

interface MarketStats {
  mean: number
  median: number
  min: number
  max: number
  p10: number
  p25: number
  p75: number
  p90: number
  std_deviation: number
}

interface PriceRange {
  min: number
  max: number
}

interface SimilarWin {
  valor: number
  orgao: string
  uf: string
  data: string
  fornecedor: string
  discount_pct: number
}

interface BenchmarkData {
  target_price: number
  percentile: number
  below_count: number
  above_count: number
  total_count: number
  market: MarketStats
  rating: Rating
  ranges: {
    agressivo: PriceRange
    competitivo: PriceRange
    moderado: PriceRange
    conservador: PriceRange
  }
  similar_wins: SimilarWin[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBRL(raw: string): number {
  const cleaned = raw
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  return parseFloat(cleaned) || 0
}


const RATING_CONFIG: Record<
  Rating,
  { label: string; bg: string; text: string }
> = {
  muito_competitivo: {
    label: 'Muito Competitivo',
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-400',
  },
  competitivo: {
    label: 'Competitivo',
    bg: 'bg-green-500/20',
    text: 'text-green-400',
  },
  na_media: {
    label: 'Na Média',
    bg: 'bg-amber-500/20',
    text: 'text-amber-400',
  },
  acima_da_media: {
    label: 'Acima da Média',
    bg: 'bg-orange-500/20',
    text: 'text-orange-400',
  },
  nao_competitivo: {
    label: 'Não Competitivo',
    bg: 'bg-red-500/20',
    text: 'text-red-400',
  },
}

const RANGE_CONFIG = [
  { key: 'agressivo' as const, label: 'Agressivo', color: 'border-emerald-500', dot: 'bg-emerald-500' },
  { key: 'competitivo' as const, label: 'Competitivo', color: 'border-emerald-400', dot: 'bg-emerald-400' },
  { key: 'moderado' as const, label: 'Moderado', color: 'border-amber-400', dot: 'bg-amber-400' },
  { key: 'conservador' as const, label: 'Conservador', color: 'border-red-400', dot: 'bg-red-400' },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GaugeBar({
  data,
}: {
  data: BenchmarkData
}) {
  const { market, percentile } = data
  const markerLeft = Math.max(0, Math.min(100, percentile))

  const zones = [
    { label: 'Agressivo', color: 'bg-emerald-500', from: 0, to: 25 },
    { label: 'Competitivo', color: 'bg-emerald-400', from: 25, to: 50 },
    { label: 'Moderado', color: 'bg-amber-400', from: 50, to: 75 },
    { label: 'Conservador', color: 'bg-red-400', from: 75, to: 100 },
  ]

  const boundaryPrices = [
    { pct: 0, price: market.p10 },
    { pct: 25, price: market.p25 },
    { pct: 50, price: market.median },
    { pct: 75, price: market.p75 },
    { pct: 100, price: market.p90 },
  ]

  return (
    <div className="mt-6 mb-2">
      {/* Zone labels */}
      <div className="flex mb-1.5">
        {zones.map((zone) => (
          <div
            key={zone.label}
            className="flex-1 text-center text-[10px] font-medium text-zinc-400"
          >
            {zone.label}
          </div>
        ))}
      </div>

      {/* Gauge bar with marker */}
      <div className="relative">
        <div className="flex h-3 rounded-full overflow-hidden">
          {zones.map((zone) => (
            <div key={zone.label} className={`flex-1 ${zone.color}`} />
          ))}
        </div>

        {/* Marker */}
        <div
          className="absolute -top-1 flex flex-col items-center pointer-events-none"
          style={{
            left: `${markerLeft}%`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-white" />
          <div className="w-0.5 h-4 bg-white" />
        </div>
      </div>

      {/* Boundary prices */}
      <div className="relative mt-2 h-5">
        {boundaryPrices.map(({ pct, price }) => (
          <span
            key={pct}
            className="absolute text-[9px] text-zinc-500 whitespace-nowrap"
            style={{
              left: `${pct}%`,
              transform:
                pct === 0
                  ? 'translateX(0)'
                  : pct === 100
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
            }}
          >
            {formatBRL(price)}
          </span>
        ))}
      </div>
    </div>
  )
}

function RatingBadge({ data }: { data: BenchmarkData }) {
  const cfg = RATING_CONFIG[data.rating]

  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <span
        className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold ${cfg.bg} ${cfg.text}`}
      >
        {cfg.label}
      </span>
      <p className="text-xs text-zinc-400">
        Percentil {Math.round(data.percentile)}° — {data.above_count} de{' '}
        {data.total_count} preços são maiores
      </p>
    </div>
  )
}

function MarketStatsGrid({ market }: { market: MarketStats }) {
  const stats = [
    { label: 'Média', value: market.mean },
    { label: 'Mediana', value: market.median },
    { label: 'P10', value: market.p10 },
    { label: 'P25', value: market.p25 },
    { label: 'P75', value: market.p75 },
    { label: 'P90', value: market.p90 },
    { label: 'Menor', value: market.min },
    { label: 'Maior', value: market.max },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 mt-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-lg bg-[#1a1c1f] px-3 py-2 border border-[#2d2f33]"
        >
          <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
            {s.label}
          </p>
          <p className="text-sm font-semibold text-zinc-200 mt-0.5">
            {formatBRL(s.value)}
          </p>
        </div>
      ))}
    </div>
  )
}

function RecommendedRanges({
  ranges,
}: {
  ranges: BenchmarkData['ranges']
}) {
  return (
    <div className="mt-6">
      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
        Faixas de Preço Recomendadas
      </h4>
      <div className="grid grid-cols-2 gap-3">
        {RANGE_CONFIG.map(({ key, label, color, dot }) => {
          const range = ranges[key]
          return (
            <div
              key={key}
              className={`rounded-lg bg-[#1a1c1f] px-3 py-2.5 border-l-2 ${color} border border-[#2d2f33]`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
                <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                  {label}
                </p>
              </div>
              <p className="text-xs font-semibold text-zinc-200">
                {formatBRL(range.min)} — {formatBRL(range.max)}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SimilarWinsTable({
  wins,
  targetPrice,
}: {
  wins: SimilarWin[]
  targetPrice: number
}) {
  if (wins.length === 0) return null

  // Find the bid closest to target price
  let closestIdx = 0
  let closestDiff = Infinity
  wins.forEach((w, i) => {
    const diff = Math.abs(w.valor - targetPrice)
    if (diff < closestDiff) {
      closestDiff = diff
      closestIdx = i
    }
  })

  const fmtDate = (dateStr: string) => dateStr ? formatDateShort(dateStr) : '—'

  return (
    <div className="mt-6">
      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
        Lances Vencedores Similares
      </h4>
      <div className="overflow-x-auto rounded-lg border border-[#2d2f33]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#2d2f33] bg-[#1a1c1f]">
              <th className="px-3 py-2 text-left font-medium text-zinc-500">
                Valor
              </th>
              <th className="px-3 py-2 text-left font-medium text-zinc-500">
                Órgão
              </th>
              <th className="px-3 py-2 text-left font-medium text-zinc-500">
                UF
              </th>
              <th className="px-3 py-2 text-left font-medium text-zinc-500">
                Data
              </th>
              <th className="px-3 py-2 text-left font-medium text-zinc-500">
                Fornecedor
              </th>
              <th className="px-3 py-2 text-right font-medium text-zinc-500">
                Desconto
              </th>
            </tr>
          </thead>
          <tbody>
            {wins.map((w, i) => {
              const isClosest = i === closestIdx
              return (
                <tr
                  key={`${w.valor}-${w.fornecedor}-${i}`}
                  className={`border-b border-[#2d2f33] last:border-b-0 ${
                    isClosest
                      ? 'bg-[#F43E01]/10 ring-1 ring-inset ring-[#F43E01]/30'
                      : 'hover:bg-[#1a1c1f]'
                  }`}
                >
                  <td className="px-3 py-2 text-zinc-200 font-medium whitespace-nowrap">
                    {formatBRL(w.valor)}
                  </td>
                  <td
                    className="px-3 py-2 text-zinc-400 max-w-[140px] truncate"
                    title={w.orgao}
                  >
                    {w.orgao}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{w.uf || '—'}</td>
                  <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                    {fmtDate(w.data)}
                  </td>
                  <td
                    className="px-3 py-2 text-zinc-400 max-w-[120px] truncate"
                    title={w.fornecedor}
                  >
                    {w.fornecedor}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-300 whitespace-nowrap">
                    {w.discount_pct > 0
                      ? `${w.discount_pct.toFixed(1)}%`
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function BenchmarkGauge({
  query,
  uf,
  modalidade,
  dateFrom,
  dateTo,
}: BenchmarkGaugeProps) {
  const [targetPrice, setTargetPrice] = useState('')
  const [data, setData] = useState<BenchmarkData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAnalyze() {
    const numericPrice = parseBRL(targetPrice)
    if (numericPrice <= 0) {
      setError('Insira um preço válido maior que zero.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        q: query,
        target_price: String(numericPrice),
      })
      if (uf) params.set('uf', uf)
      if (modalidade) params.set('modalidade', modalidade)
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)

      const res = await fetch(`/api/price-history/benchmarking?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(
          body?.error || `Erro ao buscar dados (${res.status})`,
        )
      }

      const result: BenchmarkData = await res.json()
      setData(result)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro inesperado ao analisar.'
      setError(message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  function handlePriceChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatInputBRL(e.target.value)
    setTargetPrice(formatted)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      handleAnalyze()
    }
  }

  return (
    <Card className="bg-[#23262a] border-[#2d2f33]">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-zinc-100">
          Benchmarking de Preço
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Price Input Section */}
        <div>
          <label
            htmlFor="benchmark-price"
            className="block text-xs font-medium text-zinc-400 mb-1.5"
          >
            Seu preço proposto
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                R$
              </span>
              <Input
                id="benchmark-price"
                type="text"
                inputMode="numeric"
                placeholder="0,00"
                value={targetPrice}
                onChange={handlePriceChange}
                onKeyDown={handleKeyDown}
                className="pl-9 bg-[#1a1c1f] border-[#2d2f33] text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <Button
              onClick={handleAnalyze}
              disabled={loading || !targetPrice}
              className="bg-[#F43E01] hover:bg-[#F43E01]/90 text-white font-medium px-5 disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Analisando
                </span>
              ) : (
                'Analisar'
              )}
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Empty State */}
        {!data && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="rounded-full bg-[#1a1c1f] p-4 mb-3">
              <svg
                className="h-6 w-6 text-zinc-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                />
              </svg>
            </div>
            <p className="text-sm text-zinc-500">
              Insira seu preço proposto para ver o posicionamento no mercado
            </p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div className="space-y-4 py-4">
            <div className="h-3 w-full rounded bg-[#1a1c1f] animate-pulse" />
            <div className="h-8 w-48 mx-auto rounded bg-[#1a1c1f] animate-pulse" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 rounded bg-[#1a1c1f] animate-pulse"
                />
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {data && (
          <>
            {/* Gauge */}
            <GaugeBar data={data} />

            {/* Rating Badge */}
            <RatingBadge data={data} />

            {/* Market Stats */}
            <div>
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                Estatísticas de Mercado
              </h4>
              <MarketStatsGrid market={data.market} />
            </div>

            {/* Recommended Price Ranges */}
            <RecommendedRanges ranges={data.ranges} />

            {/* Similar Winning Bids */}
            <SimilarWinsTable
              wins={data.similar_wins}
              targetPrice={data.target_price}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
