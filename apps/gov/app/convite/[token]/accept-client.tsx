'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { acceptConviteAction } from '@/lib/equipe/actions'

export function ConviteAcceptClient({ token }: { token: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onAccept() {
    setError(null)
    startTransition(async () => {
      const res = await acceptConviteAction(token)
      if (!res.ok) {
        setError(res.error)
        toast.error(res.error)
        return
      }
      toast.success('Bem-vindo(a) à equipe!')
      router.push('/dashboard')
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Clique abaixo para aceitar o convite e entrar no órgão.
      </p>
      <Button onClick={onAccept} disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Aceitando…
          </>
        ) : (
          'Aceitar convite'
        )}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
