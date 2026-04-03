'use client'

import { useState } from 'react'

interface NeuralTriggerButtonProps {
  type: 'fraud' | 'price'
  tenderId?: string
  queryHash?: string
  label?: string
  className?: string
  onResult?: (id: string) => void
}

/**
 * NeuralTriggerButton — On-demand button that triggers MiroFish analysis.
 * Shows confirmation modal before consuming LLM tokens.
 * Prevents accidental token usage.
 */
export function NeuralTriggerButton({
  type,
  tenderId,
  queryHash,
  label,
  className,
  onResult,
}: NeuralTriggerButtonProps) {
  const [loading, setLoading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultId, setResultId] = useState<string | null>(null)

  const buttonLabel = label || (type === 'fraud' ? 'Analise Neural' : 'Previsao Neural')

  async function handleConfirm() {
    setShowConfirm(false)
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/neural/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, tenderId, queryHash }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Erro ao iniciar analise')
        setLoading(false)
        return
      }

      setResultId(data.id)
      onResult?.(data.id)

      if (data.cached) {
        setLoading(false)
      } else {
        // Poll for completion
        pollForResult(data.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro de conexao')
      setLoading(false)
    }
  }

  async function pollForResult(id: string) {
    const maxAttempts = 60
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      try {
        const res = await fetch(`/api/neural/result?type=${type}&id=${id}`)
        const data = await res.json()
        const analysis = data.analysis || data.prediction
        if (analysis?.status === 'completed') {
          setLoading(false)
          onResult?.(id)
          return
        }
        if (analysis?.status === 'failed') {
          setError(analysis.error_message || 'Analise falhou')
          setLoading(false)
          return
        }
      } catch {
        // Continue polling
      }
    }
    setError('Timeout: analise demorou mais que o esperado')
    setLoading(false)
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={loading}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
          ${loading
            ? 'bg-zinc-800 text-zinc-500 cursor-wait'
            : 'bg-gradient-to-r from-emerald-600/20 to-cyan-600/20 text-emerald-400 border border-emerald-600/30 hover:from-emerald-600/30 hover:to-cyan-600/30 hover:border-emerald-500/50'
          } ${className || ''}`}
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Analisando...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            {buttonLabel}
          </>
        )}
      </button>

      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1c1f] border border-zinc-700 rounded-xl p-6 max-w-md mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-600/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold">Analise Neural</h3>
                <p className="text-gray-400 text-xs">Motor preditivo MiroFish</p>
              </div>
            </div>

            <p className="text-gray-300 text-sm mb-4">
              {type === 'fraud'
                ? 'Esta analise vai construir um grafo de relacionamentos societarios, simular cenarios de conluio e identificar conexoes ocultas entre as empresas participantes.'
                : 'Esta analise vai simular o comportamento dos fornecedores e prever a faixa de preco para proximas licitacoes semelhantes.'}
            </p>

            <p className="text-gray-500 text-xs mb-6">
              Usa inteligencia artificial avancada. O resultado sera armazenado em cache para consultas futuras.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2 px-4 rounded-lg text-sm text-gray-400 border border-zinc-700 hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-2 px-4 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
              >
                Iniciar Analise
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
