'use client'

import { useState } from 'react'
import { friendlyError } from '@/lib/error-messages'

export function UpgradeButton({ planId, label }: { planId: string; label: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      const data = await res.json()
      if (data.url && data.url.startsWith('http')) {
        window.location.href = data.url
      } else if (data.url) {
        console.error('[checkout] URL inválida:', data.url)
        setError('Não conseguimos iniciar o checkout. Tente de novo em alguns instantes.')
        setLoading(false)
      } else {
        const errMsg = data.error || 'Erro ao criar sessão de pagamento'
        console.error('[checkout]', errMsg)
        setError(friendlyError(errMsg))
        setLoading(false)
      }
    } catch (err) {
      console.error('[checkout]', err)
      setError(friendlyError(err))
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full py-2 px-4 bg-brand text-white rounded-md hover:bg-brand/90 text-sm font-medium disabled:opacity-50"
      >
        {loading ? 'Redirecionando...' : label}
      </button>
      {error && <p className="text-red-400 text-xs mt-2 text-center">{error}</p>}
    </div>
  )
}
