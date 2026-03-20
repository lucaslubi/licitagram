'use client'

import { useState, useTransition } from 'react'
import { reportOutcome } from '@/actions/bid-outcomes'

interface PendingOutcome {
  id: string
  objeto: string
  orgao_nome: string
  uf: string
  data_encerramento: string | null
}

export function PendingOutcomesBanner({ pendingOutcomes }: { pendingOutcomes: PendingOutcome[] }) {
  const [expanded, setExpanded] = useState(false)
  const [reported, setReported] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const visibleCount = pendingOutcomes.filter((o) => !reported.has(o.id)).length
  if (visibleCount === 0) return null

  function handleReport(matchId: string, outcome: 'won' | 'lost' | 'did_not_participate') {
    startTransition(async () => {
      await reportOutcome(matchId, outcome)
      setReported((prev) => new Set(prev).add(matchId))
    })
  }

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-medium text-amber-800">
          {'\uD83D\uDCCA'} {visibleCount} licita{visibleCount === 1 ? '\u00E7\u00E3o encerrada aguarda' : '\u00E7\u00F5es encerradas aguardam'} seu resultado
        </span>
        <span className="text-amber-600 text-xs">{expanded ? 'Fechar' : 'Ver detalhes'}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {pendingOutcomes
            .filter((o) => !reported.has(o.id))
            .map((outcome) => (
              <div
                key={outcome.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md bg-white p-3 border border-amber-200"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{outcome.objeto}</p>
                  <p className="text-xs text-gray-400">
                    {outcome.orgao_nome} — {outcome.uf}
                    {outcome.data_encerramento && ` — Encerrada em ${new Date(outcome.data_encerramento).toLocaleDateString('pt-BR')}`}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleReport(outcome.id, 'won')}
                    disabled={isPending}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-50"
                  >
                    Ganhei
                  </button>
                  <button
                    onClick={() => handleReport(outcome.id, 'lost')}
                    disabled={isPending}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-100 text-red-700 hover:bg-red-200 transition-colors disabled:opacity-50"
                  >
                    Perdi
                  </button>
                  <button
                    onClick={() => handleReport(outcome.id, 'did_not_participate')}
                    disabled={isPending}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    N{'\u00E3'}o participei
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
