'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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

const TABS: { id: View; label: string }[] = [
  { id: 'dashboard', label: 'Configurações' },
  { id: 'pregao', label: 'Pré-Disputa' },
  { id: 'live', label: 'Ao Vivo' },
]

export function BotWarRoom({ configs, sessions, companyId, tenders, competitors }: Props) {
  const [view, setView] = useState<View>('dashboard')
  const activeSessions = sessions.filter(
    (s: Record<string, unknown>) => s.status === 'active' || s.status === 'pending',
  ).length

  return (
    <div className="relative">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Robô de Lances
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Automação inteligente para pregões eletrônicos
          </p>
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

      <Tabs value={view} onValueChange={(v) => setView(v as View)}>
        <TabsList className="mb-5 h-auto w-full justify-start gap-1 rounded-none border-b border-border bg-transparent p-0">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="relative -mb-px rounded-none border-b-2 border-transparent bg-transparent px-5 py-3 text-sm font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="dashboard" className="mt-0 focus-visible:ring-0">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <BotDashboard
            configs={configs as any}
            sessions={sessions as any}
            companyId={companyId}
          />
        </TabsContent>

        <TabsContent value="pregao" className="mt-0 focus-visible:ring-0">
          <div className="-mx-4 sm:-mx-6 lg:-mx-8">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <SalaDoRegao
              tenders={tenders as any}
              competitors={competitors as any}
              configs={configs as any}
              companyId={companyId}
            />
          </div>
        </TabsContent>

        <TabsContent value="live" className="mt-0 focus-visible:ring-0">
          <div className="-mx-4 sm:-mx-6 lg:-mx-8">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <PregaoLive
              sessions={sessions as any}
              configs={configs as any}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
