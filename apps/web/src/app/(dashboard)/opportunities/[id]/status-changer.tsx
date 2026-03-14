'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const STATUSES = [
  { value: 'new', label: 'Nova', color: 'bg-gray-100 text-gray-800' },
  { value: 'interested', label: 'Interesse', color: 'bg-blue-100 text-blue-800' },
  { value: 'applied', label: 'Participando', color: 'bg-purple-100 text-purple-800' },
  { value: 'won', label: 'Venceu', color: 'bg-green-100 text-green-800' },
  { value: 'lost', label: 'Perdeu', color: 'bg-red-100 text-red-800' },
  { value: 'dismissed', label: 'Descartada', color: 'bg-gray-100 text-gray-500' },
]

export function StatusChanger({
  matchId,
  currentStatus,
}: {
  matchId: string
  currentStatus: string
}) {
  const [status, setStatus] = useState(currentStatus)
  const [updating, setUpdating] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function updateStatus(newStatus: string) {
    setUpdating(true)
    setErrorMsg('')
    const { error } = await supabase
      .from('matches')
      .update({ status: newStatus })
      .eq('id', matchId)

    if (error) {
      setErrorMsg('Erro ao atualizar status. Tente novamente.')
    } else {
      setStatus(newStatus)
    }
    setUpdating(false)
  }

  const current = STATUSES.find((s) => s.value === status)

  return (
    <div className="space-y-3">
      {errorMsg && <p className="text-sm text-red-600 bg-red-50 px-3 py-1.5 rounded">{errorMsg}</p>}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Atual:</span>
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
