'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { requestPasswordReset } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    setSuccess(null)
    const result = await requestPasswordReset(formData)
    if (result?.error) {
      setError(result.error)
    } else if (result?.success) {
      setSuccess(result.success)
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mb-6">
            <Image src="/logo-login.png" alt="Licitagram" width={800} height={240} className="h-32 w-auto mx-auto" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Recuperar senha</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Informe seu email e enviaremos um link para redefinir a senha.
          </p>
        </div>

        <div className="rounded-large border border-border bg-card p-8 shadow-sm">
          {error && (
            <div className="mb-4 rounded-lg bg-red-900/20 border border-red-900/30 p-3 text-sm text-red-400">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-lg bg-emerald-900/20 border border-emerald-900/30 p-3 text-sm text-emerald-400">
              {success}
            </div>
          )}

          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="seu@email.com"
                required
                autoComplete="email"
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading || !!success}>
              {loading ? 'Enviando...' : success ? 'Link enviado' : 'Enviar link'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Lembrou da senha?{' '}
            <Link href="/login" className="text-brand font-medium hover:underline">
              Voltar ao login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
