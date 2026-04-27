'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deleteAccount } from '@/actions/conta/delete-account'

type Props = {
  userEmail: string
  onClose: () => void
}

export function DeleteModal({ userEmail, onClose }: Props) {
  const [confirmation, setConfirmation] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const canSubmit =
    confirmation.trim() === 'DELETAR' &&
    emailInput.trim().toLowerCase() === userEmail.trim().toLowerCase()

  function submit() {
    setError('')
    startTransition(async () => {
      const res = await deleteAccount({
        confirmation: confirmation.trim(),
        email: emailInput.trim(),
        reason: reason.trim() || undefined,
      })
      if (!res.success) {
        const msg =
          res.error === 'invalid_confirmation'
            ? 'Digite DELETAR exatamente como mostrado.'
            : res.error === 'invalid_email'
              ? 'O email informado não corresponde ao seu.'
              : 'Não foi possível agendar a exclusão. Tente novamente.'
        setError(msg)
        return
      }
      // Logout efetuado no server. Redireciona para login com aviso.
      window.location.href = '/login?deletion_scheduled=1'
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-destructive">ATENÇÃO — Ação permanente</h2>
        <div className="mt-3 text-sm text-muted-foreground space-y-2">
          <p>O que vai acontecer:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Você terá <strong>14 dias</strong> para reverter (login bloqueado).</li>
            <li>Após 14 dias, todos os dados são apagados conforme LGPD.</li>
            <li>Sua assinatura será <strong>cancelada imediatamente</strong>.</li>
            <li>Você não receberá mais cobranças.</li>
          </ul>
        </div>

        <div className="mt-5 space-y-3">
          <div>
            <Label htmlFor="del-conf">
              Para confirmar, digite <code className="font-mono">DELETAR</code>:
            </Label>
            <Input
              id="del-conf"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="DELETAR"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="del-email">Confirme seu email:</Label>
            <Input
              id="del-email"
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={userEmail}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="del-reason">Motivo (opcional):</Label>
            <Input
              id="del-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Conta-nos por que (opcional)"
              className="mt-1"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!canSubmit || pending}>
            {pending ? 'Confirmando…' : 'Confirmar exclusão'}
          </Button>
        </div>
      </div>
    </div>
  )
}
