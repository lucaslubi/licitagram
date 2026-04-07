'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface MissingField {
  field: string
  label: string
  importance: 'critical' | 'recommended'
}

interface HealthData {
  score: number
  missing: MissingField[]
  criticalCount: number
  recommendedCount: number
}

const DISMISS_KEY = 'profile-health-dismissed-until'

export function ProfileHealthBanner() {
  const [data, setData] = useState<HealthData | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Check if user dismissed for today (only affects non-critical banners)
    const dismissedUntil = localStorage.getItem(DISMISS_KEY)
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil, 10)) {
      setDismissed(true)
    }

    fetch('/api/company/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setData(json))
      .catch(() => setData(null))
  }, [])

  if (!data) return null
  if (data.score >= 70 && data.criticalCount === 0) return null

  const hasCritical = data.criticalCount > 0
  // Critical banners always show; recommended ones respect dismiss-for-today
  if (!hasCritical && dismissed) return null

  const criticalFields = data.missing
    .filter((m) => m.importance === 'critical')
    .map((m) => m.label)
  const recommendedFields = data.missing
    .filter((m) => m.importance === 'recommended')
    .map((m) => m.label)

  function handleDismiss() {
    // Dismiss for 24h
    const until = Date.now() + 24 * 60 * 60 * 1000
    localStorage.setItem(DISMISS_KEY, String(until))
    setDismissed(true)
  }

  if (hasCritical) {
    return (
      <div className="mx-4 mt-4 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-foreground">
                Seu perfil está incompleto
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-mono tabular-nums">
                {data.score}/100
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-2">
              Estamos deixando de entregar a experiência completa. Complete estes campos críticos para
              desbloquear a Inteligência Competitiva, o Radar Semanal e matches de maior qualidade:
            </p>
            <p className="text-xs text-foreground mb-3">
              <span className="font-medium">Faltando:</span> {criticalFields.join(' · ')}
            </p>
            <Link
              href="/company"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs font-medium text-red-300 hover:bg-red-500/20 transition-colors"
            >
              Completar perfil agora
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Only recommended fields missing — amber banner, dismissible
  return (
    <div className="mx-4 mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground">
            <span className="font-medium">Quer ver mais oportunidades?</span>{' '}
            <span className="text-muted-foreground">
              Adicione {recommendedFields.slice(0, 3).join(', ')}
              {recommendedFields.length > 3 ? ` e mais ${recommendedFields.length - 3}` : ''} para melhorar seus matches.
            </span>
          </p>
        </div>
        <Link
          href="/company"
          className="text-xs text-amber-400 hover:text-amber-300 font-medium whitespace-nowrap"
        >
          Completar →
        </Link>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground text-lg leading-none"
          aria-label="Dispensar por hoje"
        >
          ×
        </button>
      </div>
    </div>
  )
}
