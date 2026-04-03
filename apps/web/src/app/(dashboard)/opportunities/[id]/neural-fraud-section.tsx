'use client'

import { useState } from 'react'
import { NeuralTriggerButton } from '@/components/neural/NeuralTriggerButton'
import { NeuralFraudDashboard } from '@/components/neural/NeuralFraudDashboard'

interface NeuralFraudSectionProps {
  tenderId: string
}

/**
 * NeuralFraudSection — Client component that shows the Neural Analysis trigger
 * button and renders the full dashboard when analysis is available.
 * Only rendered for Enterprise users (checked in parent server component).
 */
export function NeuralFraudSection({ tenderId }: NeuralFraudSectionProps) {
  const [analysisId, setAnalysisId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      {!analysisId && (
        <div className="flex items-center justify-between bg-[#111214] border border-zinc-800 rounded-xl p-4">
          <div>
            <h3 className="text-white text-sm font-semibold">Analise Neural Anti-Fraude</h3>
            <p className="text-gray-500 text-xs mt-0.5">Cruzamento profundo de grafos societarios com simulacao de conluio</p>
          </div>
          <NeuralTriggerButton
            type="fraud"
            tenderId={tenderId}
            onResult={(id) => setAnalysisId(id)}
          />
        </div>
      )}

      {analysisId && <NeuralFraudDashboard analysisId={analysisId} />}
    </div>
  )
}
