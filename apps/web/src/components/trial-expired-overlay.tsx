'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Lock, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TrialExpiredOverlayProps {
  plans?: { id: string; slug: string; name: string; price_cents: number }[]
}

export function TrialExpiredOverlay({ plans = [] }: TrialExpiredOverlayProps) {
  const pathname = usePathname()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Don't show overlay on billing page (it has its own plan selection UI)
  if (pathname.startsWith('/billing')) return null

  // Pick the starter plan as default CTA, fallback to first plan
  const defaultPlan = plans.find((p) => p.slug === 'starter') || plans[0]

  async function handleSubscribe() {
    if (!defaultPlan) {
      // No plans available — fallback to billing page
      window.location.href = '/billing?expired=true'
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: defaultPlan.id }),
      })
      const data = await res.json()
      if (data.url && data.url.startsWith('http')) {
        window.location.href = data.url
      } else {
        setError(data.error || 'Erro ao criar sessão de pagamento')
        setLoading(false)
      }
    } catch {
      setError('Erro de conexão. Tente novamente.')
      setLoading(false)
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/90 backdrop-blur-md" />
      <div className="relative z-10 text-center max-w-lg mx-auto px-6">
        <div className="w-20 h-20 rounded-2xl bg-red-900/20 border border-red-900/30 flex items-center justify-center mx-auto mb-6">
          <Lock className="w-10 h-10 text-red-400" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Seu período de teste expirou
        </h2>
        <p className="text-sm text-muted-foreground mb-2">
          Seus dados estão salvos e seguros. Assine um plano para restaurar o acesso completo à plataforma.
        </p>
        <p className="text-xs text-muted-foreground mb-8">
          Todas as suas licitações, matches e configurações serão restaurados exatamente como estavam.
        </p>
        <Button
          size="lg"
          className="gap-2"
          onClick={handleSubscribe}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Redirecionando...
            </>
          ) : (
            <>
              Assinar agora
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>

        {/* Secondary: see all plans */}
        <div className="mt-4">
          <a
            href="/billing"
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
          >
            Ver todos os planos
          </a>
        </div>

        {error && (
          <p className="text-red-400 text-xs mt-4">{error}</p>
        )}
      </div>
    </div>
  )
}
