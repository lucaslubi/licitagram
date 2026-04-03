'use client'

import { useState } from 'react'
import { NeuralTriggerButton } from '@/components/neural/NeuralTriggerButton'
import { NeuralFraudDashboard } from '@/components/neural/NeuralFraudDashboard'

interface NeuralFraudSectionProps {
  tenderId: string
}

export function NeuralFraudSection({ tenderId }: NeuralFraudSectionProps) {
  const [analysisData, setAnalysisData] = useState<any>(null)

  return (
    <div className="space-y-4">
      {!analysisData && (
        <div className="flex items-center justify-between bg-[#111214] border border-zinc-800 rounded-xl p-4">
          <div>
            <h3 className="text-white text-sm font-semibold">Analise Neural Anti-Fraude</h3>
            <p className="text-gray-500 text-xs mt-0.5">Cruzamento de grafos societarios com simulacao de conluio via MiroFish</p>
          </div>
          <NeuralTriggerButton
            type="fraud"
            tenderId={tenderId}
            onResult={(_id, data) => setAnalysisData(data)}
          />
        </div>
      )}

      {analysisData && (
        <div>
          <button
            onClick={() => setAnalysisData(null)}
            className="text-gray-500 hover:text-gray-300 text-xs mb-2"
          >
            ← Voltar
          </button>
          <NeuralFraudDashboard analysisId={analysisData.id} initialData={analysisData} />
        </div>
      )}
    </div>
  )
}
