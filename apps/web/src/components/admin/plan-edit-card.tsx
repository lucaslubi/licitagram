'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { updatePlan, togglePlanActive } from '@/actions/admin/plans'
import type { PlanFeatures } from '@licitagram/shared'

const FEATURE_LABELS: Record<keyof PlanFeatures, string> = {
  portais: 'Portais',
  chat_ia: 'Chat IA',
  compliance_checker: 'Compliance',
  competitive_intel: 'Inteligência Competitiva',
  export_excel: 'Export Excel',
  multi_cnpj: 'Multi CNPJ',
  api_integration: 'API',
  proposal_generator: 'Gerador Proposta',
  bidding_bot: 'Robô de Lances',
  priority_support: 'Suporte Prioritário',
  whatsapp_alerts: 'WhatsApp FastMatch',
  telegram_alerts: 'Telegram SmartAlerts',
  lead_engine: 'Licitagram Prospector',
  radar_map: 'Licitagram GeoRadar',
  certidoes_bot: 'Guardian Compliance',
}

function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

export function PlanEditCard({ plan }: { plan: any }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const features = (plan.features || {}) as PlanFeatures

  const [form, setForm] = useState({
    name: plan.name as string,
    description: (plan.description || '') as string,
    price_cents: plan.price_cents as number,
    max_matches_per_month: plan.max_matches_per_month as number | null,
    max_users: plan.max_users as number | null,
    max_ai_analyses_per_month: plan.max_ai_analyses_per_month as number | null,
    max_alerts_per_day: plan.max_alerts_per_day as number | null,
    extra_user_price_cents: (plan.extra_user_price_cents || 0) as number,
    stripe_price_id: (plan.stripe_price_id || '') as string,
    features: { ...features },
  })

  function handleSave() {
    setMsg(null)
    startTransition(async () => {
      const res = await updatePlan(plan.id, {
        name: form.name,
        description: form.description || undefined,
        price_cents: form.price_cents,
        max_matches_per_month: form.max_matches_per_month,
        max_users: form.max_users,
        max_ai_analyses_per_month: form.max_ai_analyses_per_month,
        max_alerts_per_day: form.max_alerts_per_day,
        extra_user_price_cents: form.extra_user_price_cents,
        stripe_price_id: form.stripe_price_id || undefined,
        features: form.features,
      })
      if (res.error) {
        setMsg(`Erro: ${res.error}`)
      } else {
        setMsg('Salvo!')
        setEditing(false)
        router.refresh()
      }
    })
  }

  function handleToggleActive() {
    startTransition(async () => {
      await togglePlanActive(plan.id, !plan.is_active)
      router.refresh()
    })
  }

  function setLimit(key: string, value: string) {
    const num = value === '' ? null : parseInt(value)
    setForm((f) => ({ ...f, [key]: num }))
  }

  function toggleFeature(key: keyof PlanFeatures) {
    setForm((f) => ({
      ...f,
      features: { ...f.features, [key]: !f.features[key] },
    }))
  }

  if (!editing) {
    const enabledFeatures = Object.entries(features)
      .filter(([, v]) => v === true || (Array.isArray(v) && v.length > 0))
      .map(([k]) => k)

    return (
      <Card className={!plan.is_active ? 'opacity-60' : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{plan.name}</CardTitle>
            <Badge variant="outline" className={plan.is_active ? 'bg-emerald-900/20 text-emerald-400' : 'bg-[#2d2f33] text-gray-400'}>
              {plan.is_active ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
          <p className="text-2xl font-bold">{formatBRL(plan.price_cents)}<span className="text-sm font-normal text-gray-400">/mês</span></p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-gray-400">Slug</span><code className="bg-[#2d2f33] px-1.5 py-0.5 rounded text-xs">{plan.slug}</code></div>
          <div className="flex justify-between"><span className="text-gray-400">Matches/mês</span><span>{plan.max_matches_per_month ?? '∞'}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Max usuários</span><span>{plan.max_users ?? '∞'}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Análises IA/mês</span><span>{plan.max_ai_analyses_per_month ?? '∞'}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Alertas/dia</span><span>{plan.max_alerts_per_day ?? '∞'}</span></div>
          {plan.extra_user_price_cents > 0 && (
            <div className="flex justify-between"><span className="text-gray-400">Usuário extra</span><span>{formatBRL(plan.extra_user_price_cents)}/mês</span></div>
          )}
          <div className="flex justify-between"><span className="text-gray-400">Stripe Price ID</span><code className="bg-[#2d2f33] px-1.5 py-0.5 rounded text-xs truncate max-w-32">{plan.stripe_price_id || '—'}</code></div>
          <div className="pt-2 border-t">
            <p className="text-xs text-gray-400 mb-1">Features ativas:</p>
            <div className="flex flex-wrap gap-1">
              {enabledFeatures.map((f) => (
                <span key={f} className="bg-blue-900/20 text-blue-400 text-[10px] px-1.5 py-0.5 rounded">{f}</span>
              ))}
            </div>
          </div>
          <div className="pt-3 border-t flex gap-2">
            <button onClick={() => setEditing(true)} className="px-3 py-1.5 bg-brand text-white rounded text-xs hover:bg-brand/80">
              Editar
            </button>
            <button onClick={handleToggleActive} disabled={isPending} className="px-3 py-1.5 border rounded text-xs hover:bg-[#2d2f33]">
              {plan.is_active ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Editing mode
  return (
    <Card className="ring-2 ring-blue-500">
      <CardHeader>
        <CardTitle className="text-base">Editando: {plan.slug}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Nome</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Descrição</label>
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Preço (centavos)</label>
            <input type="number" value={form.price_cents} onChange={(e) => setForm((f) => ({ ...f, price_cents: parseInt(e.target.value) || 0 }))} className="w-full px-2 py-1.5 border rounded text-sm" />
            <span className="text-[10px] text-gray-400">{formatBRL(form.price_cents)}</span>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Usuário extra (centavos)</label>
            <input type="number" value={form.extra_user_price_cents} onChange={(e) => setForm((f) => ({ ...f, extra_user_price_cents: parseInt(e.target.value) || 0 }))} className="w-full px-2 py-1.5 border rounded text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Matches/mês (vazio = ∞)</label>
            <input type="number" value={form.max_matches_per_month ?? ''} onChange={(e) => setLimit('max_matches_per_month', e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" placeholder="∞" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Max usuários (vazio = ∞)</label>
            <input type="number" value={form.max_users ?? ''} onChange={(e) => setLimit('max_users', e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" placeholder="∞" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Análises IA/mês (vazio = ∞)</label>
            <input type="number" value={form.max_ai_analyses_per_month ?? ''} onChange={(e) => setLimit('max_ai_analyses_per_month', e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" placeholder="∞" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Alertas/dia (vazio = ∞)</label>
            <input type="number" value={form.max_alerts_per_day ?? ''} onChange={(e) => setLimit('max_alerts_per_day', e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" placeholder="∞" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Stripe Price ID</label>
          <input value={form.stripe_price_id} onChange={(e) => setForm((f) => ({ ...f, stripe_price_id: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm font-mono" placeholder="price_..." />
        </div>
        <div className="pt-2 border-t">
          <p className="text-xs text-gray-400 mb-2">Features:</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(FEATURE_LABELS) as (keyof PlanFeatures)[]).filter(k => k !== 'portais').map((key) => (
              <label key={key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.features[key]}
                  onChange={() => toggleFeature(key)}
                  className="rounded border-[#2d2f33]"
                />
                {FEATURE_LABELS[key]}
              </label>
            ))}
          </div>
        </div>
        {msg && <p className={`text-xs ${msg.startsWith('Erro') ? 'text-red-400' : 'text-emerald-400'}`}>{msg}</p>}
        <div className="pt-3 border-t flex gap-2">
          <button onClick={handleSave} disabled={isPending} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-500 disabled:opacity-50">
            {isPending ? 'Salvando...' : 'Salvar'}
          </button>
          <button onClick={() => setEditing(false)} className="px-3 py-1.5 border rounded text-xs hover:bg-[#2d2f33]">
            Cancelar
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
