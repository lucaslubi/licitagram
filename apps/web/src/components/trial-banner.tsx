'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, ArrowRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TrialBannerProps {
  daysLeft: number
}

export function TrialBanner({ daysLeft }: TrialBannerProps) {
  const [dismissed, setDismissed] = useState(true) // start hidden to avoid flash

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    const key = `trial-alert-dismissed-${today}`
    setDismissed(localStorage.getItem(key) === 'true')
  }, [])

  if (dismissed) return null

  const handleDismiss = () => {
    const today = new Date().toISOString().split('T')[0]
    localStorage.setItem(`trial-alert-dismissed-${today}`, 'true')
    setDismissed(true)
  }

  const isUrgent = daysLeft <= 1
  const bgColor = isUrgent
    ? 'bg-red-900/30 border-red-900/40'
    : 'bg-amber-900/30 border-amber-900/40'
  const textColor = isUrgent ? 'text-red-400' : 'text-amber-400'
  const iconColor = isUrgent ? 'text-red-400' : 'text-amber-400'

  const label = daysLeft <= 0
    ? 'Seu trial expira hoje!'
    : daysLeft === 1
      ? 'Seu trial expira amanhã!'
      : `Seu trial expira em ${daysLeft} dias`

  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 border-b ${bgColor}`}>
      <div className="flex items-center gap-3 min-w-0">
        <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
        <p className={`text-sm font-medium ${textColor}`}>
          {label}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button asChild size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
          <a href="/billing?upgrade=true">
            Fazer Upgrade
            <ArrowRight className="w-3 h-3" />
          </a>
        </Button>
        <button
          onClick={handleDismiss}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          aria-label="Fechar alerta"
        >
          <X className={`w-3.5 h-3.5 ${textColor}`} />
        </button>
      </div>
    </div>
  )
}
