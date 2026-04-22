'use client'

import { BotDashboard } from './bot-dashboard'

interface Props {
  configs: Record<string, unknown>[]
  sessions: Record<string, unknown>[]
  companyId: string
  tenders?: Record<string, unknown>[]
  competitors?: Record<string, unknown>[]
}

/**
 * BotWarRoom — the top-level /bot page container.
 *
 * Simplified to the single real flow: Configurações (BotDashboard).
 * The previous Pré-Disputa and Ao Vivo tabs were built on mock data
 * (mockHabilitados, mockDifficulty, mockSuggestion, lancesMock) and were
 * actively confusing paying clients — deleted entirely.
 *
 * When the real forensic-replay and pre-dispute UIs are ready, add them
 * as dedicated routes (/bot/[sessionId]/replay already exists).
 */
export function BotWarRoom({ configs, sessions, companyId }: Props) {
  const activeSessions = sessions.filter(
    (s: Record<string, unknown>) => s.status === 'active' || s.status === 'pending',
  ).length

  return (
    <div className="relative">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Robô de Lances
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Configure um portal, inicie uma sessão, acompanhe em tempo real.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <a
              href="/bot/demo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand/40 bg-brand/10 px-3 py-1.5 font-medium text-brand hover:bg-brand/20"
            >
              ▶️ Ver demonstração (2 min) ↗
            </a>
            <a
              href="/bot/guia"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              📖 Guia completo ↗
            </a>
          </div>
        </div>

        {activeSessions > 0 && (
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-400">
              <span className="font-mono tabular-nums">{activeSessions}</span>{' '}
              {activeSessions === 1 ? 'sessão ativa' : 'sessões ativas'}
            </span>
          </span>
        )}
      </div>

      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <BotDashboard
        configs={configs as any}
        sessions={sessions as any}
        companyId={companyId}
      />
    </div>
  )
}
