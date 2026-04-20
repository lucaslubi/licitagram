'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { avancarComplianceAction } from '@/lib/compliance/actions'

export function AvancarComplianceButton({ processoId }: { processoId: string }) {
  const router = useRouter()
  const [advancing, startAdvance] = useTransition()

  const advance = () => {
    startAdvance(async () => {
      const res = await avancarComplianceAction(processoId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Compliance aprovado. Avançando para elaboração do Edital.')
      router.push(`/processos/${processoId}/edital`)
    })
  }

  return (
    <Button onClick={advance} disabled={advancing} variant="gradient">
      {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
      Prosseguir para Edital
    </Button>
  )
}
