'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateClientSubscription } from '@/actions/admin/clients'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Ativo', color: 'bg-emerald-100 text-emerald-800' },
  trialing: { label: 'Trial', color: 'bg-blue-100 text-blue-800' },
  past_due: { label: 'Pagamento Pendente', color: 'bg-amber-100 text-amber-800' },
  canceled: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
  inactive: { label: 'Inativo', color: 'bg-gray-100 text-gray-600' },
}

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
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  function handlePlanChange(planId: string) {
    if (planId === currentPlanId) return
    const plan = allPlans.find(p => p.id === planId)
    if (!plan) return

    const confirmed = window.confirm(
      `Alterar plano para "${plan.name}" (${formatBRL(plan.price_cents)}/mês)?\n\n` +
      (currentStatus !== 'active' && currentStatus !== 'trialing'
        ? '⚡ O status será ativado automaticamente para liberar as features.'
        : 'As features do novo plano serão aplicadas imediatamente.')
    )
    if (!confirmed) return

    setMsg(null)
    startTransition(async () => {
      const res = await updateClientSubscription(companyId, { plan_id: planId })
      if (res.error) {
        setMsg({ text: res.error, type: 'error' })
      } else {
        setMsg({ text: `Plano alterado para ${plan.name}! Features ativas.`, type: 'success' })
        router.refresh()
      }
    })
  }

  function handleStatusChange(status: string) {
    if (status === currentStatus) return
    const label = STATUS_LABELS[status]?.label || status

    const confirmed = window.confirm(
      `Alterar status para "${label}"?\n\n` +
      (status !== 'active' && status !== 'trialing'
        ? '⚠️ O usuário PERDERÁ acesso às features do plano.'
        : '✅ O usuário terá acesso às features do plano.')
    )
    if (!confirmed) return

    setMsg(null)
    startTransition(async () => {
      const res = await updateClientSubscription(companyId, { status })
      if (res.error) {
        setMsg({ text: res.error, type: 'error' })
      } else {
        setMsg({ text: `Status alterado para ${label}!`, type: 'success' })
        router.refresh()
      }
    })
  }

  function formatBRL(cents: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
  }

  const statusInfo = STATUS_LABELS[currentStatus] || { label: currentStatus, color: 'bg-gray-100 text-gray-600' }
  const needsActivation = currentStatus !== 'active' && currentStatus !== 'trialing'

  return (
    <div className="space-y-3 pt-3 border-t">
      {needsActivation && (
        <div className="rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          Status <strong>{statusInfo.label}</strong> — features do plano estao bloqueadas.
          Troque o plano ou ative o status para liberar.
        </div>
      )}

      <div>
        <label className="text-xs text-gray-500 block mb-1">Alterar Plano</label>
        <select
          value={currentPlanId || ''}
          onChange={(e) => handlePlanChange(e.target.value)}
          disabled={isPending}
          className="w-full px-2 py-1.5 border rounded text-sm bg-white disabled:opacity-50"
        >
          <option value="" disabled>Selecionar plano...</option>
          {allPlans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {formatBRL(p.price_cents)}/mes
            </option>
          ))}
        </select>
        {needsActivation && currentPlanId && (
          <p className="text-xs text-amber-600 mt-1">
            Ao trocar o plano, o status sera ativado automaticamente.
          </p>
        )}
      </div>

      <div>
        <label className="text-xs text-gray-500 block mb-1">Alterar Status</label>
        <select
          value={currentStatus}
          onChange={(e) => handleStatusChange(e.target.value)}
          disabled={isPending}
          className="w-full px-2 py-1.5 border rounded text-sm bg-white disabled:opacity-50"
        >
          {Object.entries(STATUS_LABELS).map(([value, { label }]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {msg && (
        <p className={`text-xs font-medium ${msg.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
          {msg.type === 'error' ? 'Erro: ' : '✓ '}{msg.text}
        </p>
      )}
      {isPending && <p className="text-xs text-gray-400 animate-pulse">Salvando...</p>}
    </div>
  )
}
