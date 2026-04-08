'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'

export function RefreshPanel() {
  const router = useRouter()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    setLastUpdated(new Date())
    const interval = setInterval(() => {
      handleRefresh()
    }, 60000) // auto-refresh every 60s
    return () => clearInterval(interval)
  }, [])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    router.refresh()
    setTimeout(() => {
      setIsRefreshing(false)
      setLastUpdated(new Date())
    }, 1000)
  }

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={handleRefresh}
        disabled={isRefreshing}
        className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded flex items-center gap-2 transition-all disabled:opacity-50"
      >
        <svg
          className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Atualizar Dados
      </button>
      {lastUpdated && (
        <span className="text-xs text-gray-500">
          Última vez atualizado: {lastUpdated.toLocaleTimeString('pt-BR')}
        </span>
      )}
    </div>
  )
}
