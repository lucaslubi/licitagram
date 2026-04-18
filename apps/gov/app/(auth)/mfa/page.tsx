import type { Metadata } from 'next'
import { ShieldCheck } from 'lucide-react'
import { MfaChallengeForm } from './challenge-form'

export const metadata: Metadata = { title: 'Verificação MFA' }

export default function MfaPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <ShieldCheck className="h-8 w-8 text-primary" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Verificação em duas etapas</h1>
        <p className="text-sm text-muted-foreground">
          Abra seu app autenticador (Google Authenticator, 1Password, Authy) e informe o código de 6 dígitos.
        </p>
      </header>
      <MfaChallengeForm />
    </div>
  )
}
