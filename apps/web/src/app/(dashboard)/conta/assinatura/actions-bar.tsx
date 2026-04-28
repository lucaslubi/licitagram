'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { openStripePortal, reactivateSubscription } from '@/actions/conta/cancel-subscription'
import { CancelModal } from './cancel-modal'
import { friendlyError } from '@/lib/error-messages'

export function PortalButton({ disabled }: { disabled?: boolean }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function open() {
    setError('')
    startTransition(async () => {
      const res = await openStripePortal()
      if (!res.success || !res.url) {
        setError(res.error ? friendlyError(res.error) : 'Erro ao abrir portal.')
        return
      }
      window.location.href = res.url
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="outline" onClick={open} disabled={pending || disabled}>
        {pending ? 'Abrindo…' : 'Gerenciar pagamento'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}

export function ChangePlanButton() {
  return (
    <Button asChild variant="outline">
      <Link href="/conta/assinatura?upgrade=1">Mudar plano</Link>
    </Button>
  )
}

export function ReactivateButton() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function reactivate() {
    setError('')
    startTransition(async () => {
      const res = await reactivateSubscription()
      if (!res.success) {
        setError(res.error ? friendlyError(res.error) : 'Erro ao reativar.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <Button onClick={reactivate} disabled={pending}>
        {pending ? 'Reativando…' : 'Reativar assinatura'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}

export function CancelTrigger({ periodEnd }: { periodEnd: string | null }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-destructive hover:underline"
      >
        Cancelar assinatura
      </button>
      <CancelModal open={open} onClose={() => setOpen(false)} periodEnd={periodEnd} />
    </>
  )
}
