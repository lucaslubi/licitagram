'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clock, Copy, Loader2, Mail, Plus, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  inviteMemberAction,
  revokeConviteAction,
  removeMembroAction,
  type ConviteRow,
  type MembroRow,
} from '@/lib/equipe/actions'
import { PAPEL_LABEL, type Papel } from '@/lib/equipe/constants'

interface Props {
  membros: MembroRow[]
  convites: ConviteRow[]
  currentUserId: string
}

export function EquipeManager({ membros, convites, currentUserId }: Props) {
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<Papel>('requisitante')
  const [lastUrl, setLastUrl] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const invite = () => {
    startTransition(async () => {
      const res = await inviteMemberAction(email, papel)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Convite enviado para ${email}`)
      if (res.url) setLastUrl(res.url)
      setEmail('')
      router.refresh()
    })
  }

  const revoke = (id: string) => {
    if (!window.confirm('Revogar este convite?')) return
    startTransition(async () => {
      const res = await revokeConviteAction(id)
      if (!res.ok) toast.error(res.error)
      else {
        toast.success('Convite revogado')
        router.refresh()
      }
    })
  }

  const remove = (m: MembroRow) => {
    if (m.id === currentUserId) {
      toast.error('Use LGPD delete para remover sua própria conta')
      return
    }
    if (!window.confirm(`Rebaixar ${m.nomeCompleto} para Requisitante? Histórico de atos será preservado.`)) return
    startTransition(async () => {
      const res = await removeMembroAction(m.id)
      if (!res.ok) toast.error(res.error)
      else {
        toast.success('Membro rebaixado')
        router.refresh()
      }
    })
  }

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado')
    } catch {
      toast.error('Não consegui copiar, selecione manualmente')
    }
  }

  const pendentes = convites.filter((c) => !c.aceitoEm && !c.revogado && new Date(c.expiraEm) > new Date())

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> Convidar pessoa
          </CardTitle>
          <CardDescription>
            Enviamos um link único por email. Se o convidado ainda não tem conta, ele cadastra e já entra no seu órgão.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="maria@orgao.gov.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="papel">Papel</Label>
              <select
                id="papel"
                value={papel}
                onChange={(e) => setPapel(e.target.value as Papel)}
                disabled={pending}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {(Object.entries(PAPEL_LABEL) as [Papel, string][]).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button onClick={invite} disabled={pending || !email}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {pending ? 'Enviando...' : 'Enviar convite'}
          </Button>
          {lastUrl && (
            <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs">
              <p className="mb-1 font-medium">Link único gerado — valido por 7 dias</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate font-mono text-[11px]">{lastUrl}</code>
                <Button size="sm" variant="outline" onClick={() => copyUrl(lastUrl)}>
                  <Copy className="h-3 w-3" /> Copiar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {pendentes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Convites pendentes ({pendentes.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {pendentes.map((c) => (
                <li key={c.id} className="flex items-center gap-3 p-3">
                  <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {PAPEL_LABEL[c.papel as Papel] ?? c.papel}
                      <span> · expira em </span>
                      {new Date(c.expiraEm).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <Badge variant="outline" className="border-warning/30 bg-warning/5 text-warning">
                    <Clock className="mr-1 h-3 w-3" /> pendente
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => revoke(c.id)} disabled={pending}>
                    <X className="h-3.5 w-3.5" />
                    Revogar
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Membros ativos ({membros.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {membros.map((m) => (
              <li key={m.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {m.nomeCompleto}
                    {m.id === currentUserId && (
                      <Badge variant="outline" className="text-[10px]">
                        você
                      </Badge>
                    )}
                    {m.mfaHabilitado && (
                      <Badge variant="outline" className="border-accent/30 bg-accent/5 text-accent text-[10px]">
                        <ShieldCheck className="mr-1 h-3 w-3" /> MFA
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.email} · {PAPEL_LABEL[m.papel as Papel] ?? m.papel}
                    {m.cargo && ` · ${m.cargo}`}
                  </p>
                </div>
                {m.id !== currentUserId && (
                  <Button size="sm" variant="ghost" onClick={() => remove(m)} disabled={pending}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
