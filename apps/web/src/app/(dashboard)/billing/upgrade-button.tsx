'use client'

import { useState } from 'react'

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
      if (data.url) {
        window.location.href = data.url
      } else {
        const errMsg = data.error || 'Erro ao criar sessão de pagamento'
        setError(errMsg)
        console.error('[checkout]', errMsg)
        setLoading(false)
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Erro de conexão'
      setError(errMsg)
      console.error('[checkout]', err)
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
