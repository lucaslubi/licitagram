'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { updateMatchStatus } from '@/actions/update-match-status'

const STATUSES = [
  { value: 'new', label: 'Nova', color: 'bg-white/[0.06] text-gray-300' },
  { value: 'interested', label: 'Interesse', color: 'bg-blue-900/20 text-blue-400' },
  { value: 'applied', label: 'Participando', color: 'bg-purple-900/20 text-purple-400' },
  { value: 'won', label: 'Venceu', color: 'bg-emerald-900/20 text-emerald-400' },
  { value: 'lost', label: 'Perdeu', color: 'bg-red-900/20 text-red-400' },
  { value: 'dismissed', label: 'Descartada', color: 'bg-white/[0.06] text-gray-400' },
]

export function StatusChanger({
  matchId,
  currentStatus,
}: {
  matchId: string
  currentStatus: string
}) {
  const router = useRouter()
  const [status, setStatus] = useState(currentStatus)
  const [updating, setUpdating] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [, startTransition] = useTransition()

  async function updateStatus(newStatus: string) {
    setUpdating(true)
    setErrorMsg('')
    const result = await updateMatchStatus(matchId, newStatus)

    if (result.error) {
      setErrorMsg('Erro ao atualizar status. Tente novamente.')
    } else {
      setStatus(newStatus)
      startTransition(() => { router.refresh() })
    }
    setUpdating(false)
  }

  const current = STATUSES.find((s) => s.value === status)

  return (
    <div className="space-y-3">
      {errorMsg && <p className="text-sm text-red-400 bg-red-900/20 px-3 py-1.5 rounded">{errorMsg}</p>}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">Atual:</span>
        <Badge className={current?.color}>{current?.label || status}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {STATUSES.filter((s) => s.value !== status).map((s) => (
          <Button
            key={s.value}
            variant="outline"
            size="sm"
            disabled={updating}
            onClick={() => updateStatus(s.value)}
            className="text-xs"
          >
            {s.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
