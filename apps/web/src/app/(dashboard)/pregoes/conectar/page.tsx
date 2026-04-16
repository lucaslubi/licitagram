'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GuidedLogin } from './guided-login'

// ─── Types ──────────────────────────────────────────────────────────────────

type Step = 'portal' | 'terms' | 'login' | 'success'

// ─── Portal Options ─────────────────────────────────────────────────────────

const portals = [
  { slug: 'comprasgov', name: 'Compras.gov.br', available: true, description: 'Portal do Governo Federal' },
  { slug: 'bll', name: 'BLL', available: false, description: 'Bolsa de Licitações e Leilões' },
  { slug: 'licitanet', name: 'Licitanet', available: false, description: 'Portal Licitanet' },
  { slug: 'pcp', name: 'Portal de Compras Públicas', available: false, description: 'Portal de Compras Públicas' },
]

// ─── Component ──────────────────────────────────────────────────────────────

export default function ConectarPortalPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('portal')
  const [selectedPortal, setSelectedPortal] = useState<string>('')
  const [termsAccepted, setTermsAccepted] = useState(false)

  const steps: Step[] = ['portal', 'terms', 'login', 'success']
  const currentStepIndex = steps.indexOf(step)

  function handlePortalSelect(slug: string) {
    setSelectedPortal(slug)
    setStep('terms')
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conectar Portal</h1>
        <p className="text-muted-foreground">
          Faça login no portal de licitações — o Licitagram captura a sessão automaticamente
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {['Portal', 'Termos', 'Login'].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
              ${currentStepIndex === i ? 'bg-primary text-primary-foreground' :
                currentStepIndex > i ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {currentStepIndex > i ? '✓' : i + 1}
            </div>
            <span className={`text-xs hidden sm:inline ${currentStepIndex === i ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
              {label}
            </span>
            {i < 2 && <div className="w-8 h-px bg-gray-300" />}
          </div>
        ))}
      </div>

      {/* Step 1: Select Portal */}
      {step === 'portal' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {portals.map((portal) => (
            <Card
              key={portal.slug}
              className={`cursor-pointer transition-all ${portal.available ? 'hover:border-primary hover:shadow-md' : 'opacity-60 cursor-not-allowed'}`}
              onClick={() => portal.available && handlePortalSelect(portal.slug)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{portal.name}</CardTitle>
                  {!portal.available && <Badge variant="secondary">Em breve</Badge>}
                </div>
                <CardDescription>{portal.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Step 2: Terms */}
      {step === 'terms' && (
        <Card>
          <CardHeader>
            <CardTitle>Termo de Autorização</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg text-sm space-y-2">
              <p>
                No próximo passo, você fará login no portal {portals.find(p => p.slug === selectedPortal)?.name} diretamente
                pelo navegador seguro do Licitagram. Nenhuma senha é armazenada — apenas os cookies da sessão são capturados
                e criptografados para uso no monitoramento.
              </p>
              <p>
                O acesso é limitado à leitura de mensagens do chat do pregoeiro.
                Quando a sessão expirar, você precisará fazer login novamente.
              </p>
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1"
              />
              <span className="text-sm">
                Autorizo o Licitagram a acessar o portal em meu nome para fins de monitoramento de pregões.
              </span>
            </label>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('portal')}>
                Voltar
              </Button>
              <Button
                disabled={!termsAccepted}
                onClick={() => setStep('login')}
              >
                Prosseguir para Login
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Guided Login */}
      {step === 'login' && (
        <GuidedLogin
          onSuccess={() => setStep('success')}
          onCancel={() => setStep('terms')}
        />
      )}

      {/* Success */}
      {step === 'success' && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="text-5xl">✅</div>
            <h3 className="text-xl font-semibold text-green-700">Conectado com sucesso!</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Sua sessão no Compras.gov.br foi capturada. Agora adicione um pregão para começar o monitoramento.
            </p>
            <div className="flex gap-3">
              <Button onClick={() => router.push('/pregoes/adicionar')}>
                Adicionar Pregão para Monitorar
              </Button>
              <Button variant="ghost" onClick={() => router.push('/pregoes')}>
                Voltar ao Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
