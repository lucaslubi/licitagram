import Link from 'next/link'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { LoginForm } from './login-form'
import { AuthDivider, GoogleButton } from '@/components/auth/GoogleButton'

export const metadata: Metadata = { title: 'Entrar' }

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Entrar na sua conta</h1>
        <p className="text-sm text-muted-foreground">
          Use seu email institucional. MFA é exigido para coordenadores.
        </p>
      </header>
      <GoogleButton />
      <AuthDivider />
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
      <div className="space-y-2 text-center text-sm">
        <p className="text-muted-foreground">
          Ainda não tem conta?{' '}
          <Link href="/cadastro" className="font-medium text-primary hover:underline">
            Cadastre seu órgão
          </Link>
        </p>
        <p className="text-muted-foreground">
          <Link href="/recuperar-senha" className="hover:text-foreground hover:underline">
            Esqueci minha senha
          </Link>
        </p>
      </div>
    </div>
  )
}
