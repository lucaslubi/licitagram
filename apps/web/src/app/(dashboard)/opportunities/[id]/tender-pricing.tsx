'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrencyBR as formatBRL } from '@/lib/format'

interface Recommendation {
  strategy: 'agressivo' | 'competitivo' | 'seguro'
  price: number
  discount_pct: number
  win_probability: number
  risk_level: string
  rationale: string
}

interface TenderPricingProps {
  objeto: string
  valorEstimado: number | null
  uf: string | null
  modalidade: string | null
}

const STRATEGY_COLORS = {
  agressivo: { border: 'border-red-500/30', badge: 'bg-red-500/20 text-red-400', bar: 'bg-red-500', icon: '⚡' },
  competitivo: { border: 'border-amber-500/30', badge: 'bg-amber-500/20 text-amber-400', bar: 'bg-amber-500', icon: '◎' },
  seguro: { border: 'border-emerald-500/30', badge: 'bg-emerald-500/20 text-emerald-400', bar: 'bg-emerald-500', icon: '🛡' },
} as const

export function TenderPricing({ objeto, valorEstimado, uf, modalidade }: TenderPricingProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confidence, setConfidence] = useState<{ label: string; level: string } | null>(null)
  const [sampleSize, setSampleSize] = useState(0)

  // Extract keywords from objeto for search
  const searchQuery = objeto
    .replace(/constitui\s+objeto.*?(contrata..o|aquisi..o|fornecimento|presta..o)\s*(de\s+)?/gi, '')
    .replace(/\b(para|com|sem|das?|dos?|nas?|nos?|pela|pelo|conforme|visando|objetivando)\b/gi, '')
    .trim()
    .substring(0, 100)

  const fetchPricing = useCallback(async () => {
    if (!searchQuery || searchQuery.length < 3 || !valorEstimado || valorEstimado <= 0) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/price-history/contextual-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          valor_estimado: valorEstimado,
          uf: uf || undefined,
          modalidade: modalidade || undefined,
        }),
      })

      const text = await res.text()
      let data: any
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(res.status >= 500 ? 'Serviço temporariamente indisponível. Tente novamente.' : `Erro (${res.status})`)
      }
      if (!res.ok) throw new Error((data.error as string) || `Erro (${res.status})`)

      setRecommendations(data.recommendations || [])
      setConfidence(data.context?.confidence || null)
      setSampleSize(data.context?.sample_size || 0)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao analisar preços')
    } finally {
      setLoading(false)
    }
  }, [searchQuery, valorEstimado, uf, modalidade])

  // Don't auto-fetch without valor_estimado
  if (!valorEstimado || valorEstimado <= 0) return null

  if (!recommendations.length && !loading && !error) {
    return (
      <Card className="bg-[#131316] border-white/[0.06]">
        <CardContent className="py-4 flex items-center justify-between">
          <div>
            <p className="text-white text-sm font-medium">✨ Precificador Inteligente</p>
            <p className="text-xs text-gray-500">Análise contextual de preços para esta licitação</p>
          </div>
          <Button
            size="sm"
            onClick={fetchPricing}
            className="bg-secondary hover:bg-white/[0.09] text-gray-300 text-xs border border-white/[0.06]"
          >
            Analisar preços
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card className="bg-[#131316] border-white/[0.06]">
        <CardContent className="py-6 text-center">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-gray-400">Analisando licitações similares...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="bg-[#131316] border-red-500/30">
        <CardContent className="py-4 text-center">
          <p className="text-red-400 text-xs">{error}</p>
          <Button variant="ghost" size="sm" onClick={fetchPricing} className="text-gray-400 text-xs mt-1">
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-[#131316] border-white/[0.06]">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm text-white">✨ Precificador Inteligente</CardTitle>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {sampleSize} licitações similares analisadas
            {confidence && (
              <span className={`ml-2 ${confidence.level === 'alta' ? 'text-emerald-400' : confidence.level === 'média' ? 'text-amber-400' : 'text-red-400'}`}>
                · Confiança: {confidence.label}
              </span>
            )}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchPricing} className="text-gray-500 hover:text-white h-7 w-7 p-0">
          ↻
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          {recommendations.map((rec) => {
            const colors = STRATEGY_COLORS[rec.strategy]
            return (
              <div
                key={rec.strategy}
                className={`rounded-lg border ${colors.border} bg-[#0a0a0b] p-3 space-y-2`}
              >
                <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${colors.badge}`}>
                  {colors.icon} {rec.strategy.charAt(0).toUpperCase() + rec.strategy.slice(1)}
                </span>
                <p className="text-lg font-bold text-white font-[family-name:var(--font-geist-mono)]">
                  {formatBRL(rec.price)}
                </p>
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-gray-500">Competitividade</span>
                    <span className="text-white font-mono">{rec.win_probability.toFixed(0)}%</span>
                  </div>
                  <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${rec.win_probability}%` }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
