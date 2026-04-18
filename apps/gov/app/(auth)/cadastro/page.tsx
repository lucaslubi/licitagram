import Link from 'next/link'
import type { Metadata } from 'next'
import { SignupForm } from './signup-form'
import { AuthDivider, GoogleButton } from '@/components/auth/GoogleButton'

export const metadata: Metadata = { title: 'Criar conta' }

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Criar sua conta</h1>
        <p className="text-sm text-muted-foreground">
          Comece com 30 dias grátis. Sem cartão de crédito. Apenas email institucional.
        </p>
      </header>
      <GoogleButton label="Continuar com Google" />
      <AuthDivider />
      <SignupForm />
      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  )
}
