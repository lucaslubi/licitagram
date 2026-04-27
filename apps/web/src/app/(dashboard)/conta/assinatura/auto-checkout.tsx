'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface Plan {
  id: string
  slug: string
  name: string
}

export function AutoCheckout({ plans }: { plans: Plan[] }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const triggered = useRef(false)

  const planSlug = searchParams.get('plan')
  const billing = searchParams.get('billing') || 'monthly'

  useEffect(() => {
    if (!planSlug || triggered.current) return

    const plan = plans.find((p) => p.slug === planSlug)
    if (!plan) return

    triggered.current = true

    async function startCheckout() {
      try {
        const res = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: plan!.id, billing }),
        })
        const data = await res.json()
        if (data.url) {
          window.location.href = data.url
        } else {
          router.replace('/conta/assinatura')
        }
      } catch {
        router.replace('/conta/assinatura')
      }
    }

    startCheckout()
  }, [planSlug, billing, plans, router])

  if (!planSlug) return null

  return (
    <div className="mb-6 p-4 bg-blue-900/20 border border-blue-900/30 rounded-lg text-blue-400 text-sm flex items-center gap-3">
      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Redirecionando para o pagamento...
    </div>
  )
}
