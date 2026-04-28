'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { cancelSubscription } from '@/actions/conta/cancel-subscription'
import { friendlyError } from '@/lib/error-messages'

type Step = 1 | 2 | 3 | 'done'

type Reason = 'caro' | 'nao_usei' | 'faltou_feature' | 'concorrente' | 'outro'

const REASONS: { value: Reason; label: string; needsDetail?: boolean; offer?: 'discount' | 'pause' }[] = [
  { value: 'caro', label: 'Caro demais', offer: 'discount' },
  { value: 'nao_usei', label: 'Não usei o suficiente', offer: 'pause' },
  { value: 'faltou_feature', label: 'Faltou uma feature importante', needsDetail: true },
  { value: 'concorrente', label: 'Achei um concorrente', needsDetail: true },
  { value: 'outro', label: 'Outro motivo', needsDetail: true },
]

function formatPeriodEnd(iso: string | null): string {
  if (!iso) return 'fim do ciclo atual'
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return 'fim do ciclo atual'
  }
}

export function CancelModal({
  open,
  onClose,
  periodEnd,
}: {
  open: boolean
  onClose: () => void
  periodEnd: string | null
}) {
  const [step, setStep] = useState<Step>(1)
  const [reason, setReason] = useState<Reason | ''>('')
  const [detail, setDetail] = useState('')
  const [pending, startTransition] = useTransition()
  const [resultMsg, setResultMsg] = useState<string>('')
  const [error, setError] = useState<string>('')

  if (!open) return null

  const selected = REASONS.find((r) => r.value === reason)
  const offer = selected?.offer ?? 'none'

  function reset() {
    setStep(1)
    setReason('')
    setDetail('')
    setResultMsg('')
    setError('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  function detailRequired(): boolean {
    if (!selected) return false
    if (selected.value === 'outro') return true
    if (selected.value === 'faltou_feature') return true
    return false
  }

  function goNextFromStep1() {
    setError('')
    if (!reason) {
      setError('Selecione um motivo.')
      return
    }
    if (detailRequired() && !detail.trim()) {
      setError('Conte um pouco mais — esse campo é obrigatório.')
      return
    }
    if (offer === 'discount' || offer === 'pause') {
      setStep(2)
    } else {
      setStep(3)
    }
  }

  function acceptOffer() {
    setError('')
    startTransition(async () => {
      const res = await cancelSubscription({
        reason: reason as Reason,
        reasonDetail: detail.trim() || undefined,
        retentionOffered: offer,
        retentionAccepted: true,
      })
      if (!res.success) {
        setError(res.error ? friendlyError(res.error) : 'Erro ao aplicar oferta.')
        return
      }
      setResultMsg(
        offer === 'discount'
          ? 'Combinado! Aplicamos 50% de desconto no próximo ciclo.'
          : 'Combinado! Sua assinatura está pausada por 30 dias.',
      )
      setStep('done')
    })
  }

  function declineOffer() {
    setStep(3)
  }

  function confirmCancel() {
    setError('')
    startTransition(async () => {
      const res = await cancelSubscription({
        reason: reason as Reason,
        reasonDetail: detail.trim() || undefined,
        retentionOffered: offer,
        retentionAccepted: false,
      })
      if (!res.success) {
        setError(res.error ? friendlyError(res.error) : 'Erro ao cancelar.')
        return
      }
      setResultMsg(
        `Cancelamento confirmado. Você continua com acesso até ${formatPeriodEnd(
          (res as any).periodEnd ?? periodEnd,
        )}.`,
      )
      setStep('done')
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold">Cancelar assinatura</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {step === 1 && (
            <>
              <p className="text-sm text-muted-foreground">
                Antes de continuar — pode contar o motivo? Isso nos ajuda a melhorar.
              </p>
              <div className="space-y-2">
                {REASONS.map((r) => (
                  <label
                    key={r.value}
                    className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer ${
                      reason === r.value ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <input
                      type="radio"
                      name="cancel-reason"
                      className="mt-1"
                      checked={reason === r.value}
                      onChange={() => setReason(r.value)}
                    />
                    <div className="text-sm">{r.label}</div>
                  </label>
                ))}
              </div>

              {selected?.needsDetail && (
                <div>
                  <label className="text-xs text-muted-foreground" htmlFor="cancel-detail">
                    {selected.value === 'faltou_feature'
                      ? 'Qual feature faltou?'
                      : selected.value === 'concorrente'
                        ? 'Qual concorrente? (opcional, mas ajuda muito)'
                        : 'Conte mais'}
                  </label>
                  <textarea
                    id="cancel-detail"
                    rows={3}
                    value={detail}
                    onChange={(e) => setDetail(e.target.value)}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={handleClose} disabled={pending}>
                  Voltar
                </Button>
                <Button onClick={goNextFromStep1} disabled={pending}>
                  Continuar
                </Button>
              </div>
            </>
          )}

          {step === 2 && offer === 'discount' && (
            <>
              <h3 className="text-base font-semibold">Antes de cancelar — que tal 50% off?</h3>
              <p className="text-sm text-muted-foreground">
                Aplicamos um desconto de 50% no próximo ciclo. Você não perde nada e pode cancelar
                depois se ainda quiser.
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={declineOffer} disabled={pending}>
                  Não, quero cancelar
                </Button>
                <Button onClick={acceptOffer} disabled={pending}>
                  {pending ? 'Aplicando…' : 'Aceitar 50% off'}
                </Button>
              </div>
            </>
          )}

          {step === 2 && offer === 'pause' && (
            <>
              <h3 className="text-base font-semibold">Quer pausar 30 dias em vez de cancelar?</h3>
              <p className="text-sm text-muted-foreground">
                Pausamos a cobrança por 30 dias. Você volta automaticamente depois — e pode reativar
                ou cancelar a qualquer momento.
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={declineOffer} disabled={pending}>
                  Não, quero cancelar
                </Button>
                <Button onClick={acceptOffer} disabled={pending}>
                  {pending ? 'Aplicando…' : 'Pausar 30 dias'}
                </Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h3 className="text-base font-semibold">Confirmar cancelamento</h3>
              <p className="text-sm text-muted-foreground">
                Sua assinatura será cancelada em{' '}
                <strong>{formatPeriodEnd(periodEnd)}</strong> (fim do ciclo pago). Você continua com
                acesso completo até lá.
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(1)} disabled={pending}>
                  Voltar
                </Button>
                <Button
                  onClick={confirmCancel}
                  disabled={pending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {pending ? 'Cancelando…' : 'Confirmar cancelamento'}
                </Button>
              </div>
            </>
          )}

          {step === 'done' && (
            <>
              <p className="text-sm">{resultMsg}</p>
              <div className="flex justify-end pt-2">
                <Button onClick={handleClose}>Fechar</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
