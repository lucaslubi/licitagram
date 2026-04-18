'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { signIn, signInWithGoogle } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function LoginForm() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const message = searchParams.get('message')
  const redirectTo = searchParams.get('redirectTo')

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    const result = await signIn(formData, redirectTo || undefined)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <div className="mb-6">
          <Image src="/logo-login.png" alt="Licitagram" width={800} height={240} className="h-32 w-auto mx-auto" />
        </div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Bem-vindo de volta</h1>
        <p className="text-sm text-muted-foreground mt-2">Entre na sua conta para continuar</p>
      </div>

      <div className="rounded-large border border-border bg-card p-8 shadow-sm">
        {message && (
          <div className={`mb-4 rounded-lg p-3 text-sm ${
            searchParams.get('type') === 'error'
              ? 'bg-red-900/20 border border-red-900/30 text-red-400'
              : 'bg-emerald-900/20 border border-emerald-900/30 text-emerald-400'
          }`}>
            {message}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg bg-red-900/20 border border-red-900/30 p-3 text-sm text-red-400">
            {error}
          </div>
        )}
        <form action={async () => { const r = await signInWithGoogle(); if (r?.error) setError(r.error) }}>
          <Button type="submit" variant="outline" className="w-full h-11 gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Entrar com Google
          </Button>
        </form>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">ou</span></div>
        </div>

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="seu@email.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Sua senha"
              required
            />
          </div>
          <Button type="submit" className="w-full h-11" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
          <p className="text-center text-sm">
            <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground hover:underline">
              Esqueci minha senha
            </Link>
          </p>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Ainda não tem conta?{' '}
          <Link href={`/register${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''}`} className="text-brand font-medium hover:underline">
            Cadastre-se
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-background">
      <Suspense fallback={<div className="text-muted-foreground">Carregando...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
