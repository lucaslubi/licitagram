'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { signUp } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    const result = await signUp(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mb-6">
            <Image src="/logo.png" alt="Licitagram" width={234} height={52} className="h-13 w-auto mx-auto" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Criar conta</h1>
          <p className="text-sm text-muted-foreground mt-2">Comece a monitorar licitações agora</p>
        </div>

        <div className="rounded-large border border-border bg-card p-8 shadow-sm">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name" className="text-sm font-medium">Nome completo</Label>
              <Input
                id="full_name"
                name="full_name"
                type="text"
                placeholder="Seu nome"
                required
              />
            </div>
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
                placeholder="Mínimo 6 caracteres"
                minLength={6}
                required
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? 'Criando conta...' : 'Criar conta'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Já tem conta?{' '}
            <Link href="/login" className="text-brand font-medium hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
