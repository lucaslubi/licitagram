'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SmartPricingProps {
  query: string
  uf?: string
  modalidade?: string
}

interface Recommendation {
  strategy: 'agressivo' | 'competitivo' | 'seguro'
  price: number
  win_probability: number
  risk_level: string
  rationale: string
}

interface MarketAnalysis {
  market_summary: string
  key_insights: string[]
}

interface DataQuality {
  sample_size: number
  confidence: 'alta' | 'media' | 'baixa'
  date_range: string
}

interface SmartPricingData {
  recommendations: Recommendation[]
  market_analysis: MarketAnalysis
  data_quality: DataQuality
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatBRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const STRATEGY_CONFIG = {
  agressivo: {
    label: 'Agressivo',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',
    borderClass: 'border-l-red-500',
    barColor: 'bg-red-500',
    barTrack: 'bg-red-500/10',
  },
  competitivo: {
    label: 'Competitivo',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    ),
    badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    borderClass: 'border-l-amber-500',
    barColor: 'bg-amber-500',
    barTrack: 'bg-amber-500/10',
  },
  seguro: {
    label: 'Seguro',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    borderClass: 'border-l-emerald-500',
    barColor: 'bg-emerald-500',
    barTrack: 'bg-emerald-500/10',
  },
} as const

const CONFIDENCE_CONFIG = {
  alta: { label: 'Alta', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  media: { label: 'Media', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  baixa: { label: 'Baixa', className: 'bg-red-500/15 text-red-400 border-red-500/30' },
} as const

// ---------------------------------------------------------------------------
// Skeleton components
// ---------------------------------------------------------------------------

function SkeletonBar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#2d2f33] ${className ?? 'h-4 w-full'}`} />
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Sparkle animation header */}
      <div className="flex items-center justify-center gap-3 py-6">
        <span className="text-2xl animate-pulse">&#10024;</span>
        <p className="text-sm text-gray-400 animate-pulse">Analisando dados de mercado...</p>
        <span className="text-2xl animate-pulse" style={{ animationDelay: '300ms' }}>&#10024;</span>
      </div>

      {/* Skeleton cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="bg-[#1a1c1f] border-l-4 border-l-[#2d2f33]">
            <CardContent className="p-5 space-y-4">
              <SkeletonBar className="h-5 w-24" />
              <SkeletonBar className="h-8 w-36" />
              <SkeletonBar className="h-3 w-full" />
              <SkeletonBar className="h-5 w-20" />
              <div className="space-y-1.5">
                <SkeletonBar className="h-3 w-full" />
                <SkeletonBar className="h-3 w-4/5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Skeleton market analysis */}
      <Card className="bg-[#23262a]">
        <CardContent className="p-6 space-y-3">
          <SkeletonBar className="h-5 w-40" />
          <SkeletonBar className="h-3 w-full" />
          <SkeletonBar className="h-3 w-full" />
          <SkeletonBar className="h-3 w-3/4" />
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const config = STRATEGY_CONFIG[rec.strategy]
  const clampedProb = Math.min(Math.max(rec.win_probability, 0), 100)

  return (
    <Card className={`bg-[#1a1c1f] border-l-4 ${config.borderClass} hover:border-[#2d2f33]`}>
      <CardContent className="p-5 space-y-4">
        {/* Strategy badge */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.badgeClass}`}
          >
            {config.icon}
            {config.label}
          </span>
        </div>

        {/* Price */}
        <p className="text-2xl font-bold text-white font-mono tracking-tight">
          {formatBRL.format(rec.price)}
        </p>

        {/* Win probability bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Probabilidade de vitoria</span>
            <span className="text-white font-mono font-medium">{clampedProb.toFixed(0)}%</span>
          </div>
          <div className={`h-2.5 rounded-full overflow-hidden ${config.barTrack}`}>
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${config.barColor}`}
              style={{ width: `${clampedProb}%` }}
            />
          </div>
        </div>

        {/* Risk level */}
        <div>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-[#23262a] text-gray-300 border border-[#2d2f33]">
            Risco: {rec.risk_level}
          </span>
        </div>

        {/* Rationale */}
        <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">
          {rec.rationale}
        </p>
      </CardContent>
    </Card>
  )
}

function MarketAnalysisCard({ analysis }: { analysis: MarketAnalysis }) {
  return (
    <Card className="bg-[#23262a]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <span className="text-base">&#10024;</span>
          Analise de Mercado
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-300 leading-relaxed">
          {analysis.market_summary}
        </p>

        {analysis.key_insights.length > 0 && (
          <ul className="space-y-2">
            {analysis.key_insights.map((insight, i) => {
              const dotColors = ['bg-[#F43E01]', 'bg-amber-500', 'bg-emerald-500', 'bg-blue-500', 'bg-purple-500']
              const dotColor = dotColors[i % dotColors.length]
              return (
                <li key={i} className="flex items-start gap-2.5 text-sm text-gray-400">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${dotColor}`} />
                  {insight}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function DataQualityFooter({ quality }: { quality: DataQuality }) {
  const conf = CONFIDENCE_CONFIG[quality.confidence]

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 px-1">
      <span className="flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        {quality.sample_size.toLocaleString('pt-BR')} amostras
      </span>

      <span className="text-[#2d2f33]">|</span>

      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${conf.className}`}
      >
        Confiança: {conf.label}
      </span>

      <span className="text-[#2d2f33]">|</span>

      <span className="flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {quality.date_range}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SmartPricing({ query, uf, modalidade }: SmartPricingProps) {
  const [data, setData] = useState<SmartPricingData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRecommendations = useCallback(async () => {
    if (!query.trim()) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/price-history/smart-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          ...(uf && { uf }),
          ...(modalidade && { modalidade }),
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `Erro ao gerar recomendacoes (${res.status})`)
      }

      const json: SmartPricingData = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [query, uf, modalidade])

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <Card className="bg-[#23262a]">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span className="text-xl">&#10024;</span>
                Precificador Inteligente
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                Recomendações baseadas em IA e dados de mercado
              </p>
            </div>
            <Button
              onClick={fetchRecommendations}
              disabled={loading || !query.trim()}
              className="shrink-0"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Gerando...
                </>
              ) : (
                <>
                  <span className="text-sm">&#10024;</span>
                  Gerar Recomendacoes
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Loading State                                                       */}
      {/* ------------------------------------------------------------------ */}
      {loading && <LoadingSkeleton />}

      {/* ------------------------------------------------------------------ */}
      {/* Error State                                                         */}
      {/* ------------------------------------------------------------------ */}
      {error && !loading && (
        <Card className="bg-[#23262a] border-red-500/30">
          <CardContent className="p-6 text-center space-y-3">
            <div className="flex items-center justify-center gap-2 text-red-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <p className="text-sm font-medium">Erro ao gerar recomendacoes</p>
            </div>
            <p className="text-xs text-gray-400">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRecommendations}
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Empty State (before first generation)                               */}
      {/* ------------------------------------------------------------------ */}
      {!data && !loading && !error && (
        <Card className="bg-[#23262a]">
          <CardContent className="py-16 text-center space-y-4">
            <div className="text-4xl opacity-40">&#10024;</div>
            <div>
              <p className="text-sm text-gray-300 font-medium">
                Precificacao inteligente com IA
              </p>
              <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                Clique em &quot;Gerar Recomendações&quot; para receber 3 estratégias de preço
                baseadas em dados históricos de licitações similares.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Recommendation Cards                                                */}
      {/* ------------------------------------------------------------------ */}
      {data && !loading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.recommendations.map((rec) => (
              <RecommendationCard key={rec.strategy} rec={rec} />
            ))}
          </div>

          {/* -------------------------------------------------------------- */}
          {/* Market Analysis                                                 */}
          {/* -------------------------------------------------------------- */}
          {data.market_analysis && (
            <MarketAnalysisCard analysis={data.market_analysis} />
          )}

          {/* -------------------------------------------------------------- */}
          {/* Data Quality Footer                                             */}
          {/* -------------------------------------------------------------- */}
          {data.data_quality && (
            <DataQualityFooter quality={data.data_quality} />
          )}
        </>
      )}
    </div>
  )
}
