'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface WeeklyAction {
  id: string
  type: string
  priority: 'urgent' | 'high' | 'normal'
  headline: string
  detail: string
  metrics: Array<{ label: string; value: string }>
  action_label: string | null
  action_href: string | null
  delta_text: string | null
  icon_type: string | null
}

const ICON_MAP: Record<string, string> = {
  window: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z',
  new_rival: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2',
  rival_surge: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  rival_weakness: 'M23 6l-9.5 9.5-5-5L1 18',
  price_shift: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  trend: 'M23 6l-9.5 9.5-5-5L1 18',
  win_opportunity: 'M8 21l4-4 4 4M12 3v14',
}

export function WeeklyActionsRow() {
  const [actions, setActions] = useState<WeeklyAction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/intelligence/weekly-actions')
      .then(r => r.json())
      .then(d => setActions(d.actions || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function dismiss(id: string) {
    setActions(prev => prev.filter(a => a.id !== id))
    await fetch('/api/intelligence/weekly-actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionId: id, operation: 'dismiss' }),
    })
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse">
            <div className="h-3 bg-secondary rounded w-20 mb-3" />
            <div className="h-4 bg-secondary rounded w-3/4 mb-2" />
            <div className="h-3 bg-secondary rounded w-full" />
          </div>
        ))}
      </div>
    )
  }

  if (actions.length === 0) {
    const now = new Date()
    const day = now.getDay()
    const daysUntilMonday = day === 0 ? 1 : (8 - day) % 7 || 7
    const next = new Date(now)
    next.setDate(now.getDate() + daysUntilMonday)
    const nextMonday = next.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })

    return (
      <div className="bg-card border border-border rounded-xl p-8">
        <div className="flex flex-col items-center text-center max-w-md mx-auto">
          <div className="w-10 h-10 rounded-lg bg-secondary/50 border border-border flex items-center justify-center mb-4">
            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h4 className="text-sm font-semibold mb-2">
            Próxima análise: {nextMonday}
          </h4>
          <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
            Toda segunda-feira geramos insights estratégicos baseados em 130K+ editais:
            janelas de oportunidade, novos concorrentes entrando no seu nicho,
            rivais enfraquecendo, e mudanças de preço no mercado.
          </p>
          <div className="grid grid-cols-3 gap-2 w-full text-left">
            <div className="bg-secondary/30 border border-border rounded-md p-3">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-emerald-500/80 mb-1">Exemplo</div>
              <div className="text-[11px] text-muted-foreground leading-tight">Janela em SP com 2 concorrentes</div>
            </div>
            <div className="bg-secondary/30 border border-border rounded-md p-3">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-red-500/80 mb-1">Exemplo</div>
              <div className="text-[11px] text-muted-foreground leading-tight">Novo rival com 80% win rate</div>
            </div>
            <div className="bg-secondary/30 border border-border rounded-md p-3">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-amber-500/80 mb-1">Exemplo</div>
              <div className="text-[11px] text-muted-foreground leading-tight">Desconto médio subiu 8pp</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {actions.slice(0, 3).map(action => (
        <div key={action.id} className="card-refined group">
          <div className="flex items-start justify-between mb-3">
            <div className="card-refined-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d={ICON_MAP[action.icon_type || 'trend'] || ICON_MAP.trend} />
              </svg>
            </div>
            <button
              onClick={() => dismiss(action.id)}
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors opacity-0 group-hover:opacity-100"
              title="Dispensar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>

          {action.priority === 'urgent' && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 mb-2">
              Urgente
            </span>
          )}

          <h4 className="text-[14px] font-semibold text-foreground leading-snug mb-1.5">{action.headline}</h4>
          <p className="text-[12px] text-muted-foreground leading-relaxed mb-3">{action.detail}</p>

          {action.metrics?.length > 0 && (
            <div className="flex gap-3 mb-3">
              {action.metrics.map((m, i) => (
                <div key={i} className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
                  <p className="text-[13px] font-semibold text-foreground font-mono tabular-nums">{m.value}</p>
                </div>
              ))}
            </div>
          )}

          {action.action_href && action.action_label && (
            <Link
              href={action.action_href}
              className="intel-insight-action text-[11px]"
            >
              {action.action_label} &rarr;
            </Link>
          )}
        </div>
      ))}
    </div>
  )
}
