'use client'

import { useState } from 'react'
import { NeuralTriggerButton } from '@/components/neural/NeuralTriggerButton'
import { NeuralPriceDashboard } from '@/components/neural/NeuralPriceDashboard'

interface NeuralPriceSectionProps {
  queryHash: string
}

export function NeuralPriceSection({ queryHash }: NeuralPriceSectionProps) {
  const [predictionData, setPredictionData] = useState<any>(null)

  if (!queryHash) return null

  return (
    <div className="space-y-4">
      {!predictionData && (
        <div className="flex items-center justify-between bg-[#111214] border border-zinc-800 rounded-xl p-4">
          <div>
            <h3 className="text-white text-sm font-semibold">Previsao Neural de Precos</h3>
            <p className="text-gray-500 text-xs mt-0.5">Simulacao de fornecedores com IA para prever faixa de preco</p>
          </div>
          <NeuralTriggerButton
            type="price"
            queryHash={queryHash}
            onResult={(_id, data) => setPredictionData(data)}
          />
        </div>
      )}

      {predictionData && (
        <div>
          <button
            onClick={() => setPredictionData(null)}
            className="text-gray-500 hover:text-gray-300 text-xs mb-2"
          >
            ← Nova analise
          </button>
          <NeuralPriceDashboard predictionId={predictionData.id} initialData={predictionData} />
        </div>
      )}
    </div>
  )
}
