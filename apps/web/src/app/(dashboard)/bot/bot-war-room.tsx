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

export function BotWarRoom({ configs, sessions, companyId, tenders, competitors }: Props) {
  const [view, setView] = useState<View>('dashboard')

  return (
    <div className="relative">
      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-[#1a1c1f] border border-[#2d2f33] shadow-sm rounded-lg p-1 w-fit">
        {([
          { id: 'dashboard' as const, label: 'Configurações', icon: '⚙' },
          { id: 'pregao' as const, label: 'Pre-Disputa', icon: '🎯' },
          { id: 'live' as const, label: 'Ao Vivo', icon: '⚡' },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={`px-4 py-2.5 rounded-md text-base font-medium transition-all ${
              view === tab.id
                ? 'bg-[#F43E01] text-white shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-[#2d2f33]'
            }`}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Views */}
      {view === 'dashboard' && (
        <div>
          <div className="mb-4">
            <h1 className="text-3xl font-bold text-white">LICITAGRAM BOT</h1>
            <p className="text-base text-gray-400 mt-1">
              Robô de lances automáticos para pregões eletrônicos
            </p>
          </div>
          <BotDashboard
            configs={configs as any}
            sessions={sessions as any}
            companyId={companyId}
          />
        </div>
      )}

      {view === 'pregao' && (
        <div className="-mx-4 -mt-4 sm:-mx-6 lg:-mx-8">
          <SalaDoRegao
            tenders={tenders as any}
            competitors={competitors as any}
            configs={configs as any}
            companyId={companyId}
          />
        </div>
      )}

      {view === 'live' && (
        <div className="-mx-4 -mt-4 sm:-mx-6 lg:-mx-8">
          <PregaoLive
            sessions={sessions as any}
            configs={configs as any}
          />
        </div>
      )}
    </div>
  )
}
