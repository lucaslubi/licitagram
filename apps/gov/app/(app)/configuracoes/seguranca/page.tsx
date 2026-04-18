import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { MfaEnrollment } from './mfa-enrollment'

export const metadata: Metadata = { title: 'Segurança' }

export default async function SecurityPage() {
  const supabase = createClient()
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const enrolled = factors?.totp?.find((f) => f.status === 'verified') ?? null

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Configurações</p>
        <h1 className="text-3xl font-semibold tracking-tight">Segurança</h1>
        <p className="text-sm text-muted-foreground">
          Verificação em duas etapas (MFA) e gerenciamento de fatores. Coordenadores e administradores são obrigados a habilitar MFA.
        </p>
      </header>
      <MfaEnrollment enrolled={enrolled ? { id: enrolled.id, friendlyName: enrolled.friendly_name ?? null } : null} />
    </div>
  )
}
