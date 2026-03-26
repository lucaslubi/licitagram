'use client'

import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'

interface Props {
  initialStatus: string
  initialMatchCount: number
}

const STEPS = [
  { key: 'configured', label: 'Perfil configurado' },
  { key: 'scanning', label: 'Escaneando licitações' },
  { key: 'triaging', label: 'IA analisando' },
  { key: 'ready', label: 'Oportunidades prontas' },
]

function getStepIndex(status: string): number {
  switch (status) {
    case 'pending':
    case 'scanning':
      return 1
    case 'triaging':
      return 2
    case 'ready':
      return 3
    default:
      return 1
  }
}

export function MatchingProgressBanner({ initialStatus, initialMatchCount }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [matchCount, setMatchCount] = useState(initialMatchCount)
  const [dismissed, setDismissed] = useState(false)
  const [celebrating, setCelebrating] = useState(false)

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/company/matching-status')
      if (!res.ok) return
      const data = await res.json()
      setStatus(data.status)
      setMatchCount(data.matchCount || 0)
    } catch {
      // ignore fetch errors
    }
  }, [])

  // Poll every 5 seconds while not ready
  useEffect(() => {
    if (status === 'ready' || dismissed) return

    const interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [status, dismissed, poll])

  // Celebration + auto-hide when ready
  useEffect(() => {
    if (status === 'ready' && !dismissed) {
      setCelebrating(true)
      const timer = setTimeout(() => {
        setDismissed(true)
      }, 10000)
      return () => clearTimeout(timer)
    }
  }, [status, dismissed])

  if (dismissed) return null

  const activeStep = getStepIndex(status)

  return (
    <div className="relative mx-4 mt-4 md:mx-8 md:mt-6 rounded-xl border border-white/[0.06] bg-[#23262a] px-5 py-4 shadow-lg">
      {/* Dismiss button */}
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-3 rounded-md p-1 text-gray-500 hover:bg-white/5 hover:text-gray-300 transition-colors"
        aria-label="Fechar"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        {celebrating ? (
          <span className="text-sm font-medium text-emerald-400">
            Tudo pronto! {matchCount > 0 ? `${matchCount} oportunidades encontradas.` : 'Análise concluída.'}
          </span>
        ) : (
          <span className="text-sm font-medium text-gray-300">
            Preparando suas oportunidades...
            {matchCount > 0 && (
              <span className="ml-2 text-[#F43E01]">
                {matchCount} encontrada{matchCount !== 1 ? 's' : ''}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Timeline */}
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const isCompleted = i < activeStep
          const isActive = i === activeStep
          const isPending = i > activeStep

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-1.5 min-w-0">
                <div
                  className={`
                    flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all duration-500
                    ${isCompleted ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30' : ''}
                    ${isActive ? 'bg-[#F43E01]/20 text-[#F43E01] ring-2 ring-[#F43E01]/40 animate-pulse' : ''}
                    ${isPending ? 'bg-white/[0.04] text-gray-600 ring-1 ring-white/[0.06]' : ''}
                    ${celebrating && i === 3 ? 'bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/40' : ''}
                  `}
                >
                  {isCompleted || (celebrating && i === 3) ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <span
                  className={`
                    text-[11px] leading-tight text-center whitespace-nowrap
                    ${isCompleted ? 'text-emerald-400/70' : ''}
                    ${isActive ? 'text-[#F43E01] font-medium' : ''}
                    ${isPending ? 'text-gray-600' : ''}
                    ${celebrating && i === 3 ? 'text-emerald-400 font-medium' : ''}
                  `}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div
                  className={`
                    mx-2 h-[2px] flex-1 rounded-full transition-all duration-500
                    ${i < activeStep ? 'bg-emerald-500/40' : ''}
                    ${i === activeStep ? 'bg-[#F43E01]/30' : ''}
                    ${i > activeStep ? 'bg-white/[0.06]' : ''}
                    ${celebrating ? 'bg-emerald-500/40' : ''}
                  `}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
