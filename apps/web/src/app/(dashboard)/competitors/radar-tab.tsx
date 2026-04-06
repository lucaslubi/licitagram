'use client'

import { WeeklyActionsRow } from './weekly-actions-row'

export function RadarTab() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 mb-3 px-1">
          Ações desta semana
        </h3>
        <p className="text-xs text-muted-foreground mb-4 px-1">
          Insights acionáveis gerados toda segunda-feira com base na atividade competitiva do mercado.
        </p>
        <WeeklyActionsRow />
      </div>
    </div>
  )
}
