'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateMatchStatus } from '@/actions/update-match-status'

const STATUSES = [
  { value: 'new', label: 'Nova' },
  { value: 'interested', label: 'Interesse' },
  { value: 'applied', label: 'Participando' },
  { value: 'won', label: 'Venceu' },
  { value: 'lost', label: 'Perdeu' },
  { value: 'dismissed', label: 'Descartada' },
]

export function StatusDropdown({
  matchId,
  currentStatus,
}: {
  matchId: string
  currentStatus: string
}) {
  const [open, setOpen] = useState(false)
  const [updating, setUpdating] = useState(false)
  const router = useRouter()
  const [, startTransition] = useTransition()

  async function updateStatus(newStatus: string) {
    if (newStatus === currentStatus) return
    setUpdating(true)
    const result = await updateMatchStatus(matchId, newStatus)
    if (!result.error) {
      startTransition(() => { router.refresh() })
    }
    setUpdating(false)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(!open)
        }}
        disabled={updating}
        className="p-1 rounded hover:bg-[#2d2f33] text-gray-400 hover:text-gray-400 transition-colors"
        title="Mudar status"
      >
        {updating ? (
          <span className="text-xs">...</span>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="8" cy="13" r="1.5" />
          </svg>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
            }}
          />
          <div className="absolute right-0 top-full mt-1 z-20 bg-[#1a1c1f] border rounded-md shadow-lg py-1 min-w-[140px]">
            {STATUSES.filter((s) => s.value !== currentStatus).map((s) => (
              <button
                key={s.value}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  updateStatus(s.value)
                }}
                className="block w-full text-left px-3 py-1.5 text-xs hover:bg-[#2d2f33] transition-colors"
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
