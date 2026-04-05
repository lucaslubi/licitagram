'use client'

import { useEffect, useState, useCallback } from 'react'

interface PriceBand {
  band_id: string
  band_label: string
  range: { min: number; max: number }
  count: number
  winner_count: number
  avg_discount_pct: number
  avg_valor_estimado: number
}

interface PriceBandSelectorProps {
  query: string
  uf?: string
  modalidade?: string
  onSelectBand: (valorEstimado: number, bandLabel: string) => void
  selectedBandId?: string | null
}

export function PriceBandSelector({
  query,
  uf,
  modalidade,
  onSelectBand,
  selectedBandId,
}: PriceBandSelectorProps) {
  const [bands, setBands] = useState<PriceBand[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBands = useCallback(async () => {
    if (!query || query.trim().length < 3) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ q: query })
      if (uf) params.set('uf', uf)
      if (modalidade) params.set('modalidade', modalidade)

      const res = await fetch(`/api/price-history/price-bands?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `Erro (${res.status})`)
      }

      const data = await res.json()
      setBands(data.bands || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar faixas')
    } finally {
      setLoading(false)
    }
  }, [query, uf, modalidade])

  useEffect(() => {
    fetchBands()
  }, [fetchBands])

  if (loading) {
    return (
      <div className="flex gap-2 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 flex-1 rounded-lg bg-[#23262a]" />
        ))}
      </div>
    )
  }

  if (error || bands.length === 0) return null

  const maxCount = Math.max(...bands.map((b) => b.count))

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        Selecione a faixa de valor para análise contextual
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {bands.map((band) => {
          const isSelected = selectedBandId === band.band_id
          const barWidth = Math.max(15, (band.count / maxCount) * 100)

          return (
            <button
              key={band.band_id}
              onClick={() => onSelectBand(band.avg_valor_estimado, band.band_label)}
              className={`relative rounded-lg border p-3 text-left transition-all hover:border-[#F43E01]/50 ${
                isSelected
                  ? 'border-[#F43E01] bg-[#F43E01]/10'
                  : 'border-[#2d2f33] bg-[#23262a] hover:bg-[#2a2d31]'
              }`}
            >
              <p className={`text-xs font-medium ${isSelected ? 'text-[#F43E01]' : 'text-gray-300'}`}>
                {band.band_label}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {band.count} propostas · {band.winner_count} vencedoras
              </p>

              {/* Mini bar showing relative volume */}
              <div className="mt-2 h-1 bg-[#1a1c1f] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${isSelected ? 'bg-[#F43E01]' : 'bg-emerald-500/40'}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>

              {band.avg_discount_pct > 0 && (
                <p className="text-[10px] text-emerald-400/70 mt-1">
                  ~{band.avg_discount_pct.toFixed(0)}% desc. médio
                </p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
