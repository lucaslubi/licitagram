'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function DeleteWatchlistButton({ watchlistId }: { watchlistId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    if (!confirm('Remover este concorrente da watchlist?')) return

    setLoading(true)
    const supabase = createClient()
    await supabase.from('competitor_watchlist').delete().eq('id', watchlistId)
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-red-500 hover:text-red-400 text-xs disabled:opacity-50"
      title="Remover da watchlist"
    >
      {loading ? '...' : '🗑️'}
    </button>
  )
}
