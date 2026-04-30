'use client'

/**
 * EmailConnect — card de "canal email".
 *
 * Email é o canal de login → sempre presente, não dá pra desconectar.
 * Card mostra o endereço atual e link pra /conta/perfil onde a mudança
 * de email é centralizada (com confirmação).
 */

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type Props = {
  email: string | null
}

export function EmailConnect({ email }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-amber-500" fill="currentColor" aria-hidden>
            <path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
          </svg>
          Email
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {email ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Badge className="bg-amber-600">Conectado</Badge>
                <span className="text-sm text-muted-foreground truncate" title={email}>
                  {email}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Email é seu canal principal e está vinculado ao login da conta.
            </p>
            <Link
              href="/conta/perfil"
              className="text-xs text-primary underline underline-offset-2 hover:opacity-80"
            >
              Alterar email da conta →
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum email cadastrado.{' '}
            <Link href="/conta/perfil" className="text-primary underline">
              Cadastrar
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
