'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { WinCurveChart } from './WinCurveChart'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Recommendation {
  strategy: 'agressivo' | 'competitivo' | 'seguro'
  price: number
  discount_ratio: number
  discount_pct: number
  win_probability: number
  risk_level: 'alto' | 'medio' | 'baixo'
  rationale: string
}

interface WinCurvePoint {
  discount_pct: number
  ratio: number
  price: number
  win_probability: number
}

interface ContextInfo {
  band: { min: number; max: number; label: string }
  sample_size: number
  winner_count: number
  confidence: { level: string; label: string; detail: string }
  band_widened: boolean
  date_range: string
}

interface SmartPricingV2Data {
  recommendations: Recommendation[]
  win_curve: WinCurvePoint[]
  context: ContextInfo
  discount_stats: {
    overall: { count: number; mean: number; median: number; cv_percent: number }
    winners: { count: number; mean: number; median: number }
  }
  model_type: string
  market_summary: string
  key_insights: string[]
}

interface SmartPricingV2Props {
  query: string
  valorEstimado: number
  uf?: string
  modalidade?: string
  bandLabel?: string
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)} mil`
  return formatBRL(n)
}

// ─── Strategy Config ──────────────────────────────────────────────────────────

const STRATEGY_CONFIG = {
  agressivo: {
    label: 'Agressivo',
    icon: '⚡',
    color: 'border-red-500/40',
    bgColor: 'from-red-950/20',
    badgeColor: 'bg-red-500/20 text-red-400',
    barColor: 'bg-red-500',
    probBarColor: 'bg-gradient-to-r from-red-600 to-red-400',
  },
  competitivo: {
    label: 'Competitivo',
    icon: '◎',
    color: 'border-amber-500/40',
    bgColor: 'from-amber-950/20',
    badgeColor: 'bg-amber-500/20 text-amber-400',
    barColor: 'bg-amber-500',
    probBarColor: 'bg-gradient-to-r from-amber-600 to-amber-400',
  },
  seguro: {
    label: 'Seguro',
    icon: '🛡',
    color: 'border-emerald-500/40',
    bgColor: 'from-emerald-950/20',
    badgeColor: 'bg-emerald-500/20 text-emerald-400',
    barColor: 'bg-emerald-500',
    probBarColor: 'bg-gradient-to-r from-emerald-600 to-emerald-400',
  },
} as const

// ─── Component ────────────────────────────────────────────────────────────────

export function SmartPricingV2({ query, valorEstimado, uf, modalidade, bandLabel }: SmartPricingV2Props) {
  const [data, setData] = useState<SmartPricingV2Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPricing = useCallback(async () => {
    if (!query.trim() || !valorEstimado) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/price-history/contextual-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          valor_estimado: valorEstimado,
          uf: uf || undefined,
          modalidade: modalidade || undefined,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `Erro (${res.status})`)

      setData(json)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar análise')
    } finally {
      setLoading(false)
    }
  }, [query, valorEstimado, uf, modalidade])

  // ─── Loading ──────────────────────────────────────────────────────────

  if (!data && !loading && !error) {
    return (
      <Card className="bg-[#23262a] border-[#2d2f33]">
        <CardContent className="py-8 text-center space-y-3">
          <div className="text-3xl">✨</div>
          <h3 className="text-white font-semibold">Precificador Inteligente</h3>
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            Análise contextual baseada em {bandLabel ? `licitações na faixa ${bandLabel}` : 'licitações similares'}.
            Recomendações com probabilidade de vitória calculada estatisticamente.
          </p>
          <Button
            onClick={fetchPricing}
            className="bg-[#F43E01] hover:bg-[#d63600] text-white"
          >
            ✨ Gerar Recomendações
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card className="bg-[#23262a] border-[#2d2f33]">
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#F43E01] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Analisando {bandLabel || 'mercado'}...</p>
            <p className="text-xs text-gray-600">Buscando licitações similares na faixa de valor</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="bg-[#23262a] border-red-500/30">
        <CardContent className="py-6 text-center space-y-2">
          <p className="text-red-400 text-sm">{error}</p>
          <Button variant="ghost" size="sm" onClick={fetchPricing} className="text-gray-400 hover:text-white">
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-4">
      {/* Header with context */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-white font-semibold flex items-center gap-2">
            ✨ Precificador Inteligente
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Analisando licitações de &quot;{query}&quot; na faixa {data.context.band.label}
            {' · '}{data.context.sample_size} amostras · {data.context.winner_count} vencedoras
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchPricing} className="text-gray-500 hover:text-white h-7 w-7 p-0">
            ↻
          </Button>
        </div>
      </div>

      {/* Recommendation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {data.recommendations.map((rec) => {
          const config = STRATEGY_CONFIG[rec.strategy]
          return (
            <Card
              key={rec.strategy}
              className={`bg-gradient-to-br ${config.bgColor} to-[#1a1c1f] border ${config.color} overflow-hidden`}
            >
              <CardContent className="p-4 space-y-3">
                {/* Strategy badge */}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${config.badgeColor}`}>
                  {config.icon} {config.label}
                </span>

                {/* Price */}
                <p className="text-2xl font-bold text-white font-[family-name:var(--font-geist-mono)]">
                  {formatBRL(rec.price)}
                </p>

                {/* Discount info */}
                <p className="text-xs text-gray-400">
                  Desconto de {rec.discount_pct.toFixed(1)}% sobre estimado
                </p>

                {/* Win probability bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Probabilidade de vitória</span>
                    <span className="text-white font-mono font-medium">{rec.win_probability.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-[#1a1c1f] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${config.probBarColor}`}
                      style={{ width: `${Math.min(100, rec.win_probability)}%` }}
                    />
                  </div>
                </div>

                {/* Risk badge */}
                <span className="inline-block text-[10px] text-gray-500 bg-[#1a1c1f] px-2 py-0.5 rounded">
                  RISCO: {rec.risk_level.toUpperCase()}
                </span>

                {/* Rationale */}
                <p className="text-xs text-gray-400 leading-relaxed">{rec.rationale}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Win Probability Curve */}
      {data.win_curve && data.win_curve.length > 0 && (
        <Card className="bg-[#23262a] border-[#2d2f33]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white">Curva de Probabilidade de Vitória</CardTitle>
            <p className="text-[10px] text-gray-500">
              Probabilidade de vencer vs. desconto sobre valor estimado
              {data.model_type === 'logistic' ? ' (regressão logística)' : ' (modelo empírico)'}
            </p>
          </CardHeader>
          <CardContent>
            <WinCurveChart
              curve={data.win_curve}
              strategies={data.recommendations.map((r) => ({
                strategy: r.strategy,
                discount_pct: r.discount_pct,
                win_probability: r.win_probability,
                price: r.price,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {/* Market Analysis (from LLM) */}
      {(data.market_summary || (data.key_insights && data.key_insights.length > 0)) && (
        <Card className="bg-[#23262a] border-[#2d2f33]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white">Análise de Mercado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.market_summary && (
              <p className="text-sm text-gray-300">{data.market_summary}</p>
            )}
            {data.key_insights && data.key_insights.length > 0 && (
              <ul className="space-y-1.5">
                {data.key_insights.map((insight, i) => (
                  <li key={i} className="flex gap-2 text-xs text-gray-400">
                    <span className="text-emerald-400 mt-0.5">•</span>
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Data Quality Footer */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-gray-600">
        <span>🔒 {data.context.sample_size} amostras</span>
        <span>📅 {data.context.date_range}</span>
        {data.context.band_widened && (
          <span className="text-amber-400">⚠ Faixa ampliada por amostra insuficiente</span>
        )}
      </div>
    </div>
  )
}
