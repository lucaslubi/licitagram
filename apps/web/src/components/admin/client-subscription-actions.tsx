'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateClientSubscription } from '@/actions/admin/clients'

export function ClientSubscriptionActions({
  companyId,
  currentPlanId,
  currentStatus,
  allPlans,
}: {
  companyId: string
  currentPlanId: string | null
  currentStatus: string
  allPlans: { id: string; slug: string; name: string; price_cents: number }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function handlePlanChange(planId: string) {
    setMsg(null)
    startTransition(async () => {
      const res = await updateClientSubscription(companyId, { plan_id: planId })
      if (res.error) {
        setMsg(`Erro: ${res.error}`)
      } else {
        setMsg('Plano alterado!')
        router.refresh()
      }
    })
  }

  function handleStatusChange(status: string) {
    setMsg(null)
    startTransition(async () => {
      const res = await updateClientSubscription(companyId, { status })
      if (res.error) {
        setMsg(`Erro: ${res.error}`)
      } else {
        setMsg('Status alterado!')
        router.refresh()
      }
    })
  }

  function formatBRL(cents: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
  }

  return (
    <div className="space-y-3 pt-3 border-t">
      <div>
        <label className="text-xs text-gray-500 block mb-1">Alterar Plano</label>
        <select
          value={currentPlanId || ''}
          onChange={(e) => handlePlanChange(e.target.value)}
          disabled={isPending}
          className="w-full px-2 py-1.5 border rounded text-sm bg-white"
        >
          <option value="" disabled>Selecionar plano...</option>
          {allPlans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {formatBRL(p.price_cents)}/mês
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-gray-500 block mb-1">Alterar Status</label>
        <select
          value={currentStatus}
          onChange={(e) => handleStatusChange(e.target.value)}
          disabled={isPending}
          className="w-full px-2 py-1.5 border rounded text-sm bg-white"
        >
          <option value="active">active</option>
          <option value="trialing">trialing</option>
          <option value="past_due">past_due</option>
          <option value="canceled">canceled</option>
          <option value="inactive">inactive</option>
        </select>
      </div>

      {msg && <p className={`text-xs ${msg.startsWith('Erro') ? 'text-red-600' : 'text-emerald-600'}`}>{msg}</p>}
      {isPending && <p className="text-xs text-gray-400">Salvando...</p>}
    </div>
  )
}
