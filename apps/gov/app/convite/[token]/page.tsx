import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, Building2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Logo } from '@/components/app/Logo'
import { createClient } from '@/lib/supabase/server'
import { resolveConviteAction } from '@/lib/equipe/actions'
import { PAPEL_LABEL, type Papel } from '@/lib/equipe/constants'
import { ConviteAcceptClient } from './accept-client'

export const metadata: Metadata = { title: 'Aceitar convite' }

export default async function ConvitePage({ params }: { params: { token: string } }) {
  const convite = await resolveConviteAction(params.token)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4 sm:px-6">
          <Logo />
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        {!convite ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-warning">
                <AlertTriangle className="h-5 w-5" /> Convite inválido
              </CardTitle>
              <CardDescription>
                Este convite expirou, foi revogado ou é inválido. Peça um novo ao administrador do órgão.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : convite.aceitoEm ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-accent">
                <CheckCircle2 className="h-5 w-5" /> Convite já aceito
              </CardTitle>
              <CardDescription>
                Este convite já foi usado. Se você é <strong>{convite.email}</strong>, basta entrar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/login">Entrar</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <InviteResolvedView token={params.token} convite={convite} />
        )}
      </main>
    </div>
  )
}

async function InviteResolvedView({
  token,
  convite,
}: {
  token: string
  convite: NonNullable<Awaited<ReturnType<typeof resolveConviteAction>>>
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const emailMatches = user?.email?.toLowerCase() === convite.email.toLowerCase()
  const loggedWithWrongEmail = user && !emailMatches

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Convite pra equipe</p>
        <h1 className="text-3xl font-semibold tracking-tight">Você foi convidado(a)</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            {convite.orgaoNomeFantasia ?? convite.orgaoRazaoSocial}
          </CardTitle>
          <CardDescription>
            Papel: <strong>{PAPEL_LABEL[convite.papel as Papel] ?? convite.papel}</strong>
            <br />Convite para: <code className="font-mono">{convite.email}</code>
            <br />Expira em {new Date(convite.expiraEm).toLocaleDateString('pt-BR')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!user ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Faça login ou crie uma conta com o email <code className="font-mono">{convite.email}</code> para aceitar o convite.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href={`/login?email=${encodeURIComponent(convite.email)}&next=${encodeURIComponent(`/convite/${token}`)}`}>
                    Já tenho conta — entrar
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/cadastro?next=${encodeURIComponent(`/convite/${token}`)}`}>
                    Criar conta
                  </Link>
                </Button>
              </div>
            </div>
          ) : loggedWithWrongEmail ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
                Você está logado com <strong>{user.email}</strong>, mas este convite é para{' '}
                <strong>{convite.email}</strong>. Saia e entre com o email certo.
              </div>
              <Button asChild variant="outline">
                <Link href={`/login?email=${encodeURIComponent(convite.email)}&next=${encodeURIComponent(`/convite/${token}`)}`}>
                  Trocar de conta
                </Link>
              </Button>
            </div>
          ) : (
            <ConviteAcceptClient token={token} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
