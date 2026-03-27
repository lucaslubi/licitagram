'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const PIPELINE_STATUSES = [
  { key: 'interested', label: 'Interesse', color: 'bg-brand/20 text-brand border-brand/30' },
  { key: 'applied', label: 'Participando', color: 'bg-blue-900/20 text-blue-400 border-blue-900/30' },
  { key: 'won', label: 'Venceu', color: 'bg-emerald-900/20 text-emerald-400 border-emerald-900/30' },
  { key: 'lost', label: 'Perdeu', color: 'bg-red-900/20 text-red-400 border-red-900/30' },
  { key: 'dismissed', label: 'Descartada', color: 'bg-gray-700/20 text-gray-400 border-gray-700/30' },
]

interface PipelineTagProps {
  tenderId: string
  companyId: string
  matchId?: string | null
  currentStatus?: string | null
}

export function PipelineTag({ tenderId, companyId, matchId, currentStatus }: PipelineTagProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [localMatchId, setLocalMatchId] = useState(matchId)
  const [localStatus, setLocalStatus] = useState(currentStatus)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  async function createMatch() {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('matches')
      .insert({
        tender_id: tenderId,
        company_id: companyId,
        match_source: 'manual',
        status: 'interested',
        score: 0,
      })
      .select('id')
      .single()

    if (!error && data) {
      setLocalMatchId(data.id)
      setLocalStatus('interested')
      router.refresh()
    }
    setLoading(false)
  }

  async function updateStatus(newStatus: string) {
    if (!localMatchId || newStatus === localStatus) {
      setOpen(false)
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('matches')
      .update({ status: newStatus })
      .eq('id', localMatchId)

    if (!error) {
      setLocalStatus(newStatus)
      router.refresh()
    }
    setLoading(false)
    setOpen(false)
  }

  // No match yet — show "+" button to create one
  if (!localMatchId) {
    return (
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          createMatch()
        }}
        disabled={loading}
        className="inline-flex items-center justify-center w-6 h-6 rounded border border-[#2d2f33] text-gray-400 hover:text-white hover:border-gray-500 transition-colors text-xs"
        title="Adicionar ao pipeline"
      >
        {loading ? '...' : '+'}
      </button>
    )
  }

  // Match exists — show status badge with dropdown
  const current = PIPELINE_STATUSES.find((s) => s.key === localStatus)
  const badgeLabel = current?.label || localStatus || 'N/A'
  const badgeColor = current?.color || 'bg-[#2d2f33] text-gray-400 border-[#2d2f33]'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(!open)
        }}
        disabled={loading}
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border cursor-pointer transition-colors ${badgeColor}`}
      >
        {loading ? '...' : badgeLabel}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-[#1a1c1f] border border-[#2d2f33] rounded-md shadow-lg py-1 min-w-[120px]">
          {PIPELINE_STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                updateStatus(s.key)
              }}
              className={`block w-full text-left px-3 py-1.5 text-xs transition-colors ${
                s.key === localStatus
                  ? 'text-white bg-[#2d2f33]'
                  : 'text-gray-300 hover:bg-[#2d2f33]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
