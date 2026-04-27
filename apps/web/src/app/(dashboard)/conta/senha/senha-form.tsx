'use client'

import { useState, useTransition, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { changePassword } from '@/actions/conta/change-password'

type Check = { id: string; label: string; test: (s: string) => boolean }

const CHECKS: Check[] = [
  { id: 'len', label: '8+ caracteres', test: (s) => s.length >= 8 },
  { id: 'upper', label: '1 letra maiúscula', test: (s) => /[A-Z]/.test(s) },
  { id: 'digit', label: '1 número', test: (s) => /[0-9]/.test(s) },
  { id: 'special', label: '1 caractere especial', test: (s) => /[^A-Za-z0-9]/.test(s) },
]

function strengthLabel(passed: number, length: number): { label: string; color: string; pct: number } {
  if (length === 0) return { label: '', color: 'bg-muted', pct: 0 }
  if (passed <= 1) return { label: 'Fraca', color: 'bg-red-500', pct: 25 }
  if (passed === 2) return { label: 'Média', color: 'bg-yellow-500', pct: 50 }
  if (passed === 3) return { label: 'Boa', color: 'bg-blue-500', pct: 75 }
  return { label: 'Forte', color: 'bg-green-500', pct: 100 }
}

export function SenhaForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const checkResults = useMemo(() => CHECKS.map((c) => ({ ...c, ok: c.test(next) })), [next])
  const passed = checkResults.filter((c) => c.ok).length
  const allChecksPassed = passed === CHECKS.length
  const matches = next.length > 0 && next === confirm
  const strength = strengthLabel(passed, next.length)

  const canSubmit = current.length > 0 && allChecksPassed && matches && !pending

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    if (!canSubmit) return

    startTransition(async () => {
      const res = await changePassword({ current_password: current, new_password: next })
      if (res.success) {
        setFeedback({
          kind: 'ok',
          msg: 'Senha alterada. Em outros dispositivos você será deslogado.',
        })
        setCurrent('')
        setNext('')
        setConfirm('')
      } else {
        const errMsg =
          res.error === 'invalid_current_password'
            ? 'Senha atual incorreta.'
            : res.error === 'weak_password'
              ? 'A nova senha não atende aos requisitos.'
              : res.error === 'not_authenticated'
                ? 'Sessão expirada. Faça login novamente.'
                : `Falha ao alterar senha (${res.error || 'desconhecida'}).`
        setFeedback({ kind: 'err', msg: errMsg })
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-md">
      <div className="space-y-2">
        <Label htmlFor="current_password">Senha atual</Label>
        <Input
          id="current_password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="new_password">Nova senha</Label>
        <Input
          id="new_password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />

        {next.length > 0 ? (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded bg-secondary overflow-hidden">
                <div
                  className={`h-full ${strength.color} transition-all`}
                  style={{ width: `${strength.pct}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-12 text-right">{strength.label}</span>
            </div>
            <ul className="text-xs space-y-0.5">
              {checkResults.map((c) => (
                <li key={c.id} className={c.ok ? 'text-green-400' : 'text-muted-foreground'}>
                  {c.ok ? '✓' : '○'} {c.label}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm_password">Confirmar nova senha</Label>
        <Input
          id="confirm_password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {confirm.length > 0 && !matches ? (
          <p className="text-xs text-red-400">As senhas não coincidem.</p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!canSubmit}>
          {pending ? 'Salvando…' : 'Alterar senha'}
        </Button>
        {feedback ? (
          <span className={feedback.kind === 'ok' ? 'text-xs text-green-400' : 'text-xs text-red-400'}>
            {feedback.msg}
          </span>
        ) : null}
      </div>
    </form>
  )
}
