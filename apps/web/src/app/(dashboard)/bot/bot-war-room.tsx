'use client'

import { useState } from 'react'
import SalaDoRegao from './sala-do-pregao'
import PregaoLive from './pregao-live'
import { BotDashboard } from './bot-dashboard'

interface Props {
  configs: Record<string, unknown>[]
  sessions: Record<string, unknown>[]
  companyId: string
  tenders?: Record<string, unknown>[]
  competitors?: Record<string, unknown>[]
}

type View = 'dashboard' | 'pregao' | 'live'

const TABS: { id: View; label: string; description: string }[] = [
  { id: 'dashboard', label: 'Configuracoes', description: 'Portais e credenciais' },
  { id: 'pregao', label: 'Pre-Disputa', description: 'Analise e estrategia' },
  { id: 'live', label: 'Ao Vivo', description: 'Monitor em tempo real' },
]

export function BotWarRoom({ configs, sessions, companyId, tenders, competitors }: Props) {
  const [view, setView] = useState<View>('dashboard')
  const activeSessions = sessions.filter((s: any) => s.status === 'active' || s.status === 'pending').length

  return (
    <div className="relative">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-2 rounded-full bg-[#F43E01] animate-pulse" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Robo de Lances</h1>
          {activeSessions > 0 && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {activeSessions} {activeSessions === 1 ? 'sessao ativa' : 'sessoes ativas'}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 ml-5">
          Automacao inteligente para pregoes eletronicos
        </p>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-1 mb-8 border-b border-[#2d2f33]">
        {TABS.map(tab => {
          const isActive = view === tab.id
          const isLive = tab.id === 'live'
          return (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`relative px-5 py-3 text-sm font-medium transition-all -mb-px ${
                isActive
                  ? 'text-white border-b-2 border-[#F43E01]'
                  : 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent'
              }`}
            >
              <span className="flex items-center gap-2">
                {isLive && activeSessions > 0 && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                )}
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Views */}
      {view === 'dashboard' && (
        <BotDashboard
          configs={configs as any}
          sessions={sessions as any}
          companyId={companyId}
        />
      )}

      {view === 'pregao' && (
        <div className="-mx-4 sm:-mx-6 lg:-mx-8">
          <SalaDoRegao
            tenders={tenders as any}
            competitors={competitors as any}
            configs={configs as any}
            companyId={companyId}
          />
        </div>
      )}

      {view === 'live' && (
        <div className="-mx-4 sm:-mx-6 lg:-mx-8">
          <PregaoLive
            sessions={sessions as any}
            configs={configs as any}
          />
        </div>
      )}
    </div>
  )
}
