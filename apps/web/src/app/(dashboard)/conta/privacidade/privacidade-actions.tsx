'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { requestDataExport, getDataExportDownloadUrl } from '@/actions/conta/data-export'
import { cancelDeletion } from '@/actions/conta/delete-account'
import { DeleteModal } from './delete-modal'

export function RequestExportButton({ disabled }: { disabled?: boolean }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  function submit() {
    setError('')
    setOk(false)
    startTransition(async () => {
      const res = await requestDataExport()
      if (!res.success) {
        const msg =
          res.error === 'cooldown_24h'
            ? 'Você já solicitou uma exportação nas últimas 24h. Aguarde para pedir novamente.'
            : 'Não foi possível solicitar a exportação. Tente novamente.'
        setError(msg)
        return
      }
      setOk(true)
      // Recarrega a página para refletir o novo job
      setTimeout(() => window.location.reload(), 600)
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <Button onClick={submit} disabled={pending || disabled}>
        {pending ? 'Solicitando…' : 'Solicitar exportação'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
      {ok && <span className="text-xs text-emerald-600">Solicitação registrada.</span>}
    </div>
  )
}

export function DownloadExportButton({ jobId }: { jobId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function open() {
    setError('')
    startTransition(async () => {
      const res = await getDataExportDownloadUrl(jobId)
      if (!res.success) {
        setError('Link indisponível. Solicite uma nova exportação.')
        return
      }
      window.open(res.url, '_blank', 'noopener,noreferrer')
    })
  }

  return (
    <div className="flex flex-col items-end">
      <Button variant="outline" size="sm" onClick={open} disabled={pending}>
        {pending ? '…' : 'Baixar'}
      </Button>
      {error && <span className="text-xs text-destructive mt-1">{error}</span>}
    </div>
  )
}

export function DeleteAccountButton({ userEmail }: { userEmail: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Deletar minha conta
      </Button>
      {open && <DeleteModal userEmail={userEmail} onClose={() => setOpen(false)} />}
    </>
  )
}

export function CancelDeletionButton() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function submit() {
    setError('')
    startTransition(async () => {
      const res = await cancelDeletion()
      if (!res.success) {
        setError('Não foi possível cancelar. Tente novamente.')
        return
      }
      window.location.reload()
    })
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="outline" size="sm" onClick={submit} disabled={pending}>
        {pending ? 'Cancelando…' : 'Cancelar deleção'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
