import type { Metadata } from 'next'
import { ResetPasswordForm } from './reset-form'

export const metadata: Metadata = { title: 'Redefinir senha' }

export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Redefinir senha</h1>
        <p className="text-sm text-muted-foreground">
          Escolha uma nova senha para sua conta. Mínimo 12 caracteres.
        </p>
      </header>
      <ResetPasswordForm />
    </div>
  )
}
