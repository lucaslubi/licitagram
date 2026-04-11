'use client'

import { Lock, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function TrialExpiredOverlay() {
  return (
    <div className="relative min-h-[80vh] flex items-center justify-center">
      <div className="absolute inset-0 bg-background/90 backdrop-blur-md z-10 pointer-events-none" />
      <div className="relative z-20 text-center max-w-lg mx-auto px-6">
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
        <Button asChild size="lg" className="gap-2">
          <a href="/billing?expired=true">
            Assinar agora
            <ArrowRight className="w-4 h-4" />
          </a>
        </Button>
      </div>
    </div>
  )
}
