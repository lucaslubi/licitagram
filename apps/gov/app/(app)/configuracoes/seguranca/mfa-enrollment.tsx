'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { startEnrollmentAction, unenrollAction, verifyEnrollmentAction } from '@/lib/auth/mfa'

interface Props {
  enrolled: { id: string; friendlyName: string | null } | null
}

interface Pending {
  factorId: string
  qrSrc: string
  secret: string
}

/**
 * Supabase returns `data.totp.qr_code` as either a data URL (`data:image/svg+xml;...`)
 * or raw SVG markup. Normalize to a data URL we can drop into <img src>.
 */
function toQrSrc(raw: string): string {
  if (raw.startsWith('data:')) return raw
  return `data:image/svg+xml;utf8,${encodeURIComponent(raw)}`
}

export function MfaEnrollment({ enrolled }: Props) {
  const [pending, setPending] = useState<Pending | null>(null)
  const [code, setCode] = useState('')
  const [busy, startTransition] = useTransition()

  const start = () => {
    startTransition(async () => {
      const res = await startEnrollmentAction()
      if (res.ok) {
        setPending({ factorId: res.factorId, qrSrc: toQrSrc(res.qrSvg), secret: res.secret })
      } else {
        toast.error(res.error)
      }
    })
  }

  const verify = () => {
    if (!pending) return
    startTransition(async () => {
      const res = await verifyEnrollmentAction({ factorId: pending.factorId, code })
      if (res.ok) {
        toast.success('MFA ativado com sucesso')
        setPending(null)
        setCode('')
        if (typeof window !== 'undefined') window.location.reload()
      } else {
        toast.error(res.error)
      }
    })
  }

  const remove = () => {
    if (!enrolled) return
    if (!window.confirm('Remover MFA? Você ficará sem proteção em duas etapas.')) return
    startTransition(async () => {
      const res = await unenrollAction(enrolled.id)
      if (res.ok) {
        toast.success('MFA removido')
        if (typeof window !== 'undefined') window.location.reload()
      } else {
        toast.error(res.error ?? 'Falha ao remover')
      }
    })
  }

  if (enrolled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-accent" />
            MFA ativo
          </CardTitle>
          <CardDescription>
            Sua conta está protegida por verificação em duas etapas. Você precisará do código sempre que entrar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="text-sm">
            <p className="font-medium">{enrolled.friendlyName ?? 'Authenticator'}</p>
            <p className="text-muted-foreground">
              ID: <code className="font-mono text-xs">{enrolled.id.slice(0, 8)}…</code>
            </p>
          </div>
          <Button variant="outline" onClick={remove} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Remover MFA
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (pending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Confirmar enrollment
          </CardTitle>
          <CardDescription>
            Escaneie o QR no seu app autenticador (Google Authenticator, 1Password, Authy) e confirme o primeiro código.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pending.qrSrc}
            alt="QR code para configurar MFA"
            className="mx-auto h-44 w-44 rounded-lg border border-border bg-white p-2"
          />
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">Não consigo escanear — mostrar código manual</summary>
            <code className="mt-2 block break-all rounded bg-secondary p-2 font-mono">{pending.secret}</code>
          </details>
          <div className="space-y-2">
            <Label htmlFor="mfa-code">Primeiro código gerado</Label>
            <Input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="text-center font-mono text-xl tracking-[0.4em]"
              disabled={busy}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={verify} disabled={busy || code.length !== 6}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          MFA não configurado
        </CardTitle>
        <CardDescription>
          Habilite verificação em duas etapas. Recomendado para qualquer conta, obrigatório para coordenadores.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
          Sua conta está sem MFA. Coordenadores ficam bloqueados de aprovar artefatos sem este passo.
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={start} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando QR...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Habilitar MFA
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
