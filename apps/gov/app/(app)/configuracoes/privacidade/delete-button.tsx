'use client'

import { useTransition } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { deleteMyDataAction } from '@/lib/lgpd/actions'

export function DeleteAccountButton() {
  const [pending, startTransition] = useTransition()

  const click = () => {
    const confirmation = window.prompt(
      'Para confirmar a exclusão, digite "EXCLUIR MEUS DADOS" (maiúsculas, sem aspas):',
    )
    if (confirmation !== 'EXCLUIR MEUS DADOS') {
      toast.error('Exclusão cancelada — texto de confirmação incorreto.')
      return
    }
    startTransition(async () => {
      const res = await deleteMyDataAction()
      if (!res.ok) {
        toast.error(res.error ?? 'Falha ao processar exclusão')
      }
      // Success: redirect already happened server-side
    })
  }

  return (
    <Button variant="destructive" onClick={click} disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      {pending ? 'Processando...' : 'Solicitar exclusão de dados'}
    </Button>
  )
}
