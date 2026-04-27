'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Monitor, Smartphone, Tablet } from 'lucide-react'
import { revokeSession, revokeOtherSessions } from '@/actions/conta/revoke-session'
import type { ParsedSession } from './types'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function relTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return '—'
  const diff = Date.now() - d
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `há ${hr}h`
  const day = Math.floor(hr / 24)
  return `há ${day}d`
}

function DeviceIcon({ device }: { device: string }) {
  if (device === 'Mobile') return <Smartphone size={18} className="text-muted-foreground" />
  if (device === 'Tablet') return <Tablet size={18} className="text-muted-foreground" />
  return <Monitor size={18} className="text-muted-foreground" />
}

export function SessoesList({
  sessions,
  currentSessionId,
  canList,
}: {
  sessions: ParsedSession[]
  currentSessionId: string | null
  canList: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  function handleRevoke(id: string) {
    setBusyId(id)
    setFeedback(null)
    startTransition(async () => {
      const res = await revokeSession(id)
      setBusyId(null)
      if (res.success) {
        setFeedback({ kind: 'ok', msg: 'Sessão encerrada.' })
        router.refresh()
      } else {
        setFeedback({ kind: 'err', msg: res.error || 'Falha ao encerrar.' })
      }
    })
  }

  function handleRevokeAllOthers() {
    setFeedback(null)
    startTransition(async () => {
      const res = await revokeOtherSessions(currentSessionId)
      if (res.success) {
        setFeedback({
          kind: 'ok',
          msg:
            res.removed != null
              ? `${res.removed} sessão(ões) encerrada(s).`
              : 'Outras sessões encerradas.',
        })
        router.refresh()
      } else {
        setFeedback({ kind: 'err', msg: res.error || 'Falha ao encerrar sessões.' })
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="destructive" onClick={handleRevokeAllOthers} disabled={pending}>
          Encerrar todas as outras sessões
        </Button>
        {feedback ? (
          <span
            className={
              feedback.kind === 'ok' ? 'text-xs text-green-400' : 'text-xs text-red-400'
            }
          >
            {feedback.msg}
          </span>
        ) : null}
      </div>

      {!canList ? (
        <p className="text-sm text-muted-foreground">
          Não foi possível listar sessões individuais (RPC indisponível).
        </p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma sessão ativa encontrada.</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="rounded-lg border border-border bg-secondary/20 p-3 flex items-start gap-3"
            >
              <DeviceIcon device={s.device} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">
                    {s.os} · {s.browser}
                  </span>
                  {s.is_current ? <Badge>Atual</Badge> : null}
                  {s.country ? (
                    <span className="text-xs text-muted-foreground">· {s.country}</span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Última atividade: {relTime(s.updated_at)} · Login em {fmtDate(s.created_at)}
                </p>
                {s.ip ? (
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono">{s.ip}</p>
                ) : null}
              </div>
              {!s.is_current ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending && busyId === s.id}
                  onClick={() => handleRevoke(s.id)}
                >
                  {busyId === s.id ? 'Encerrando…' : 'Encerrar'}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
