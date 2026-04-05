'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UF_OPTIONS = [
  '','AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
]

const THRESHOLD_TYPES = [
  { value: 'below_median', label: 'Abaixo da mediana' },
  { value: 'above_value', label: 'Acima de valor' },
  { value: 'below_value', label: 'Abaixo de valor' },
  { value: 'variation_pct', label: 'Variacao percentual' },
] as const

const TYPES_NEEDING_VALUE = new Set(['above_value', 'below_value', 'variation_pct'])

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PriceWatch {
  id: string
  query: string
  uf: string | null
  modalidade: string | null
  threshold_type: string
  threshold_value: number | null
  notify_email: boolean
  notify_whatsapp: boolean
  is_active: boolean
  last_triggered_at: string | null
  last_price: number | null
  unread_alerts: number
  created_at: string
}

interface FormData {
  query: string
  uf: string
  threshold_type: string
  threshold_value: string
  notify_email: boolean
  notify_whatsapp: boolean
}

const INITIAL_FORM: FormData = {
  query: '',
  uf: '',
  threshold_type: 'below_median',
  threshold_value: '',
  notify_email: true,
  notify_whatsapp: false,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

function describeThreshold(type: string, value: number | null): string {
  switch (type) {
    case 'below_median':
      return 'Quando preco ficar abaixo da mediana'
    case 'above_value':
      return `Quando preco ultrapassar ${formatBRL(value || 0)}`
    case 'below_value':
      return `Quando preco ficar abaixo de ${formatBRL(value || 0)}`
    case 'variation_pct':
      return `Quando variação exceder ${value || 0}%`
    default:
      return type
  }
}

// ---------------------------------------------------------------------------
// Icons (inline SVG)
// ---------------------------------------------------------------------------

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PriceWatch() {
  const [watches, setWatches] = useState<PriceWatch[]>([])
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ---- Fetch watches ----
  const fetchWatches = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/price-history/price-watch')
      if (!res.ok) throw new Error('Falha ao carregar alertas')
      const data = await res.json()
      setWatches(data.watches ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWatches()
  }, [fetchWatches])

  // ---- Create watch ----
  const handleCreate = async () => {
    if (!formData.query.trim()) return
    try {
      setSubmitting(true)
      setError(null)
      const body = {
        query: formData.query.trim(),
        uf: formData.uf || null,
        threshold_type: formData.threshold_type,
        threshold_value: TYPES_NEEDING_VALUE.has(formData.threshold_type)
          ? parseFloat(formData.threshold_value) || null
          : null,
        notify_email: formData.notify_email,
        notify_whatsapp: formData.notify_whatsapp,
      }
      const res = await fetch('/api/price-history/price-watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Falha ao criar alerta')
      }
      setFormData(INITIAL_FORM)
      setShowForm(false)
      await fetchWatches()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar alerta')
    } finally {
      setSubmitting(false)
    }
  }

  // ---- Toggle watch ----
  const handleToggle = async (id: string, currentActive: boolean) => {
    try {
      setError(null)
      const res = await fetch('/api/price-history/price-watch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: !currentActive }),
      })
      if (!res.ok) throw new Error('Falha ao atualizar alerta')
      setWatches((prev) =>
        prev.map((w) => (w.id === id ? { ...w, is_active: !currentActive } : w))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar')
    }
  }

  // ---- Delete watch ----
  const handleDelete = async (id: string) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id)
      return
    }
    try {
      setDeleting(id)
      setError(null)
      const res = await fetch(`/api/price-history/price-watch?id=${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Falha ao excluir alerta')
      setWatches((prev) => prev.filter((w) => w.id !== id))
      setConfirmDelete(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir')
    } finally {
      setDeleting(null)
    }
  }

  // ---- Select styles ----
  const selectClass =
    'flex h-10 w-full rounded-lg border border-input bg-background px-3.5 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-150'

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F43E01]/10">
            <BellIcon className="h-5 w-5 text-[#F43E01]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Alertas de Preço</h2>
            <p className="text-sm text-gray-400">
              {watches.length} alerta{watches.length !== 1 ? 's' : ''} configurado{watches.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <Button
          onClick={() => {
            setShowForm(!showForm)
            setFormData(INITIAL_FORM)
            setConfirmDelete(null)
          }}
          size="sm"
          variant={showForm ? 'outline' : 'default'}
        >
          <PlusIcon className="h-4 w-4" />
          {showForm ? 'Fechar' : 'Novo Alerta'}
        </Button>
      </div>

      {/* ---- Error banner ---- */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
          <button
            className="ml-2 underline hover:no-underline"
            onClick={() => setError(null)}
          >
            Fechar
          </button>
        </div>
      )}

      {/* ---- Create Form ---- */}
      {showForm && (
        <Card className="border-[#F43E01]/20 bg-[#23262a]">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Novo Alerta de Preço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Query */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">
                Produto ou serviço a monitorar <span className="text-red-400">*</span>
              </label>
              <Input
                placeholder="Ex: notebook, toner, serviço de limpeza..."
                value={formData.query}
                onChange={(e) => setFormData((f) => ({ ...f, query: e.target.value }))}
              />
            </div>

            {/* UF + Threshold Type */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-300">UF (opcional)</label>
                <select
                  className={selectClass}
                  value={formData.uf}
                  onChange={(e) => setFormData((f) => ({ ...f, uf: e.target.value }))}
                >
                  <option value="">Todos os estados</option>
                  {UF_OPTIONS.filter(Boolean).map((uf) => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-300">Tipo de alerta</label>
                <select
                  className={selectClass}
                  value={formData.threshold_type}
                  onChange={(e) => setFormData((f) => ({ ...f, threshold_type: e.target.value }))}
                >
                  {THRESHOLD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Threshold Value */}
            {TYPES_NEEDING_VALUE.has(formData.threshold_type) && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-300">
                  {formData.threshold_type === 'variation_pct' ? 'Percentual (%)' : 'Valor (R$)'}
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={formData.threshold_type === 'variation_pct' ? 'Ex: 15' : 'Ex: 1500.00'}
                  value={formData.threshold_value}
                  onChange={(e) => setFormData((f) => ({ ...f, threshold_value: e.target.value }))}
                />
              </div>
            )}

            {/* Notification Channels */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">Canais de notificação</label>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-[#F43E01] accent-[#F43E01]"
                    checked={formData.notify_email}
                    onChange={(e) => setFormData((f) => ({ ...f, notify_email: e.target.checked }))}
                  />
                  Email
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-[#F43E01] accent-[#F43E01]"
                    checked={formData.notify_whatsapp}
                    onChange={(e) => setFormData((f) => ({ ...f, notify_whatsapp: e.target.checked }))}
                  />
                  WhatsApp
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={handleCreate}
                disabled={submitting || !formData.query.trim()}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Criando...
                  </span>
                ) : (
                  'Criar Alerta'
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowForm(false)
                  setFormData(INITIAL_FORM)
                }}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- Loading skeleton ---- */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-[#2d2f33] bg-[#1a1c1f]"
            />
          ))}
        </div>
      )}

      {/* ---- Empty State ---- */}
      {!loading && watches.length === 0 && (
        <Card className="bg-[#23262a]">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F43E01]/10">
              <BellIcon className="h-8 w-8 text-[#F43E01]/60" />
            </div>
            <p className="text-base font-medium text-gray-300">
              Nenhum alerta configurado
            </p>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              Crie seu primeiro alerta para monitorar precos automaticamente.
            </p>
            {!showForm && (
              <Button
                className="mt-4"
                size="sm"
                onClick={() => setShowForm(true)}
              >
                <PlusIcon className="h-4 w-4" />
                Criar primeiro alerta
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---- Active Watches List ---- */}
      {!loading && watches.length > 0 && (
        <div className="space-y-3">
          {watches.map((watch) => (
            <Card
              key={watch.id}
              className={`bg-[#23262a] transition-all ${
                !watch.is_active ? 'opacity-60' : ''
              }`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  {/* Left side: info */}
                  <div className="min-w-0 flex-1 space-y-2">
                    {/* Query + badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white truncate">
                        {watch.query}
                      </span>
                      {watch.uf && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {watch.uf}
                        </Badge>
                      )}
                      {watch.modalidade && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {watch.modalidade}
                        </Badge>
                      )}
                      {watch.unread_alerts > 0 && (
                        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                          {watch.unread_alerts}
                        </span>
                      )}
                    </div>

                    {/* Threshold description */}
                    <p className="text-xs text-gray-400">
                      {describeThreshold(watch.threshold_type, watch.threshold_value)}
                    </p>

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                      <span>
                        Ultimo acionamento:{' '}
                        {watch.last_triggered_at
                          ? formatDate(watch.last_triggered_at)
                          : 'Nunca acionado'}
                      </span>
                      {watch.last_price !== null && (
                        <span>
                          Ultimo preco: <span className="text-gray-300">{formatBRL(watch.last_price)}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right side: controls */}
                  <div className="flex shrink-0 items-center gap-2">
                    {/* Toggle switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={watch.is_active}
                      aria-label={watch.is_active ? 'Desativar alerta' : 'Ativar alerta'}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                        watch.is_active ? 'bg-[#F43E01]' : 'bg-gray-600'
                      }`}
                      onClick={() => handleToggle(watch.id, watch.is_active)}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          watch.is_active ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>

                    {/* Delete button */}
                    <button
                      type="button"
                      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                        confirmDelete === watch.id
                          ? 'bg-red-500/20 text-red-400'
                          : 'text-gray-500 hover:bg-red-500/10 hover:text-red-400'
                      }`}
                      aria-label={confirmDelete === watch.id ? 'Confirmar exclusao' : 'Excluir alerta'}
                      title={confirmDelete === watch.id ? 'Clique novamente para confirmar' : 'Excluir alerta'}
                      disabled={deleting === watch.id}
                      onClick={() => handleDelete(watch.id)}
                    >
                      {deleting === watch.id ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-400/30 border-t-red-400" />
                      ) : (
                        <TrashIcon className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
