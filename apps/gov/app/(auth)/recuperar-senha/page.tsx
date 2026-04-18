import Link from 'next/link'
import type { Metadata } from 'next'
import { ForgotPasswordForm } from './forgot-form'

export const metadata: Metadata = { title: 'Recuperar senha' }

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Recuperar senha</h1>
        <p className="text-sm text-muted-foreground">
          Informe seu email — enviaremos um link para você redefinir a senha.
        </p>
      </header>
      <ForgotPasswordForm />
      <p className="text-center text-sm text-muted-foreground">
        Lembrou?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Voltar ao login
        </Link>
      </p>
    </div>
  )
}
