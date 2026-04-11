'use client'

import { Lock, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface UpgradeOverlayProps {
  feature: string
  requiredPlan?: string
}

export function UpgradeOverlay({ feature, requiredPlan }: UpgradeOverlayProps) {
  const planLabel = requiredPlan || 'um plano superior'

  return (
    <div className="relative min-h-[60vh] flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10" />
      <div className="relative z-20 text-center max-w-md mx-auto px-6">
        <div className="w-16 h-16 rounded-2xl bg-muted/50 border border-border flex items-center justify-center mx-auto mb-6">
          <Lock className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Funcionalidade bloqueada
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {feature} está disponível no plano <span className="font-medium text-foreground">{planLabel}</span>.
          Faça upgrade para desbloquear.
        </p>
        <Button asChild className="gap-2">
          <a href="/billing?upgrade=true">
            Fazer Upgrade
            <ArrowRight className="w-4 h-4" />
          </a>
        </Button>
      </div>
    </div>
  )
}
