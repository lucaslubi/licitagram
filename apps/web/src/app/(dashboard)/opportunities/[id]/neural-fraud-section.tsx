'use client'

import { useState } from 'react'
import { NeuralTriggerButton } from '@/components/neural/NeuralTriggerButton'
import { NeuralFraudDashboard } from '@/components/neural/NeuralFraudDashboard'
import { MiroFishEmbed } from '@/components/neural/MiroFishEmbed'

interface NeuralFraudSectionProps {
  tenderId: string
}

/**
 * NeuralFraudSection — Shows neural analysis options:
 * 1. Quick analysis via Licitagram UI (NeuralFraudDashboard)
 * 2. Full MiroFish experience (embedded Vue.js frontend)
 */
export function NeuralFraudSection({ tenderId }: NeuralFraudSectionProps) {
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [showMiroFish, setShowMiroFish] = useState(false)

  return (
    <div className="space-y-4">
      {/* Trigger buttons */}
      {!analysisId && !showMiroFish && (
        <div className="bg-[#111214] border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-white text-sm font-semibold">Analise Neural Anti-Fraude</h3>
              <p className="text-gray-500 text-xs mt-0.5">Cruzamento de grafos societarios com simulacao de conluio</p>
            </div>
          </div>
          <div className="flex gap-3">
            <NeuralTriggerButton
              type="fraud"
              tenderId={tenderId}
              label="Analise Rapida"
              onResult={(id) => setAnalysisId(id)}
            />
            <button
              onClick={() => setShowMiroFish(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-gradient-to-r from-indigo-600/20 to-purple-600/20 text-indigo-400 border border-indigo-600/30 hover:from-indigo-600/30 hover:to-purple-600/30 hover:border-indigo-500/50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              MiroFish Completo
            </button>
          </div>
        </div>
      )}

      {/* Quick analysis dashboard */}
      {analysisId && !showMiroFish && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => { setAnalysisId(null) }}
              className="text-gray-500 hover:text-gray-300 text-xs"
            >
              ← Voltar
            </button>
            <button
              onClick={() => setShowMiroFish(true)}
              className="text-indigo-400 hover:text-indigo-300 text-xs"
            >
              Abrir MiroFish completo →
            </button>
          </div>
          <NeuralFraudDashboard analysisId={analysisId} />
        </div>
      )}

      {/* Full MiroFish experience */}
      {showMiroFish && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setShowMiroFish(false)}
              className="text-gray-500 hover:text-gray-300 text-xs"
            >
              ← Voltar para Licitagram
            </button>
          </div>
          <MiroFishEmbed height={750} />
        </div>
      )}
    </div>
  )
}
