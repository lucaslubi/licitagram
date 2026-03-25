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
    <div className="mb-4 rounded-lg border border-amber-900/30 bg-amber-900/10 p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-medium text-amber-400">
          {'\uD83D\uDCCA'} {visibleCount} licita{visibleCount === 1 ? '\u00E7\u00E3o encerrada aguarda' : '\u00E7\u00F5es encerradas aguardam'} seu resultado
        </span>
        <span className="text-amber-400/70 text-xs">{expanded ? 'Fechar' : 'Ver detalhes'}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {pendingOutcomes
            .filter((o) => !reported.has(o.id))
            .map((outcome) => (
              <div
                key={outcome.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md bg-[#1a1c1f] p-3 border border-[#2d2f33]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{outcome.objeto}</p>
                  <p className="text-xs text-gray-400">
                    {outcome.orgao_nome} — {outcome.uf}
                    {outcome.data_encerramento && ` — Encerrada em ${new Date(outcome.data_encerramento).toLocaleDateString('pt-BR')}`}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleReport(outcome.id, 'won')}
                    disabled={isPending}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
                  >
                    Ganhei
                  </button>
                  <button
                    onClick={() => handleReport(outcome.id, 'lost')}
                    disabled={isPending}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-900/20 text-red-400 hover:bg-red-900/30 transition-colors disabled:opacity-50"
                  >
                    Perdi
                  </button>
                  <button
                    onClick={() => handleReport(outcome.id, 'did_not_participate')}
                    disabled={isPending}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#2d2f33] text-gray-400 hover:bg-[#2d2f33]/80 transition-colors disabled:opacity-50"
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
