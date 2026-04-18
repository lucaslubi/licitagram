'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { updatePassword } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ResetPasswordPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    const result = await updatePassword(formData)
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
            <Image src="/logo-login.png" alt="Licitagram" width={800} height={240} className="h-32 w-auto mx-auto" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Redefinir senha</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Escolha uma nova senha para sua conta. Mínimo 8 caracteres.
          </p>
        </div>

        <div className="rounded-large border border-border bg-card p-8 shadow-sm">
          {error && (
            <div className="mb-4 rounded-lg bg-red-900/20 border border-red-900/30 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Nova senha</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Ao menos 8 caracteres"
                required
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm" className="text-sm font-medium">Confirmar senha</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                placeholder="Repita a nova senha"
                required
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? 'Atualizando...' : 'Atualizar senha'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Voltar ao{' '}
            <Link href="/login" className="text-brand font-medium hover:underline">
              login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
