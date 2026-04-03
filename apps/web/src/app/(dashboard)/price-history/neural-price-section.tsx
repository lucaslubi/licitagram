'use client'

import { useState } from 'react'
import { NeuralTriggerButton } from '@/components/neural/NeuralTriggerButton'
import { NeuralPriceDashboard } from '@/components/neural/NeuralPriceDashboard'

interface NeuralPriceSectionProps {
  queryHash: string
}

/**
 * NeuralPriceSection — Shows neural price prediction trigger and dashboard.
 * Only triggers when user explicitly clicks (no automatic token consumption).
 */
export function NeuralPriceSection({ queryHash }: NeuralPriceSectionProps) {
  const [predictionId, setPredictionId] = useState<string | null>(null)

  if (!queryHash) return null

  return (
    <div className="space-y-4">
      {!predictionId && (
        <div className="flex items-center justify-between bg-[#111214] border border-zinc-800 rounded-xl p-4">
          <div>
            <h3 className="text-white text-sm font-semibold">Previsao Neural de Precos</h3>
            <p className="text-gray-500 text-xs mt-0.5">Simulacao de fornecedores com IA para prever faixa de preco</p>
          </div>
          <NeuralTriggerButton
            type="price"
            queryHash={queryHash}
            onResult={(id) => setPredictionId(id)}
          />
        </div>
      )}

      {predictionId && <NeuralPriceDashboard predictionId={predictionId} />}
    </div>
  )
}
