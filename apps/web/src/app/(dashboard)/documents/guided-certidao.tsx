'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

/* -- Types ----------------------------------------------------------------- */

interface GuidedCertidaoProps {
  portal: 'receita' | 'fgts'
  cnpj: string
  onSuccess: () => void
  onClose: () => void
}

type CertidaoStep =
  | 'opening'
  | 'filling'
  | 'captcha'
  | 'emitting'
  | 'done'
  | 'error'

const STEP_LABELS: Record<CertidaoStep, string> = {
  opening: 'Abrindo site...',
  filling: 'Preenchendo CNPJ...',
  captcha: 'Resolva o captcha abaixo',
  emitting: 'Emitindo certidão...',
  done: 'Certidão emitida!',
  error: 'Erro na emissão',
}

const PORTAL_LABELS: Record<string, string> = {
  receita: 'CND Federal (Receita/PGFN)',
  fgts: 'CRF FGTS (Caixa)',
}

/* -- Component ------------------------------------------------------------- */

export function GuidedCertidao({ portal, cnpj, onSuccess, onClose }: GuidedCertidaoProps) {
  const [sessionId] = useState(() => crypto.randomUUID())
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [step, setStep] = useState<CertidaoStep>('opening')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUrl, setCurrentUrl] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)
  const imgRef = useRef<HTMLImageElement>(null)

  /* -- API helper ---------------------------------------------------------- */

  const callApi = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const res = await fetch('/api/certidoes/guided', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        session_id: sessionId,
        portal,
        cnpj,
        ...extra,
      }),
    })
    const data = await res.json()
    if (!res.ok || data.vps_error) {
      throw new Error(data.error || `Erro do servidor (${res.status})`)
    }
    return data
  }, [sessionId, portal, cnpj])

  /* -- Start session on mount ---------------------------------------------- */

  const initSession = useCallback(async () => {
    setStep('opening')
    setError(null)
    setScreenshot(null)
    try {
      const data = await callApi('start')
      if (!mountedRef.current) return

      if (data.error) {
        setError(data.error)
        setStep('error')
        return
      }

      setScreenshot(data.screenshot || null)
      setCurrentUrl(data.url || '')
      setStep('captcha')
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : 'Falha ao conectar ao servidor de emissão')
      setStep('error')
    }
  }, [callApi])

  useEffect(() => {
    mountedRef.current = true
    initSession()

    return () => {
      mountedRef.current = false
      callApi('close').catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* -- Auto-poll screenshots ----------------------------------------------- */

  useEffect(() => {
    if (step === 'done' || step === 'error' || step === 'opening') {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }

    pollRef.current = setInterval(async () => {
      if (loading) return
      try {
        const data = await callApi('screenshot')
        if (!mountedRef.current) return
        if (data.screenshot) setScreenshot(data.screenshot)
        if (data.url) setCurrentUrl(data.url)
      } catch {
        // Silent
      }
    }, 2000)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [step, loading, callApi])

  /* -- Click handler (coordinates from screenshot) ------------------------- */

  async function handleImageClick(e: React.MouseEvent<HTMLImageElement>) {
    if (loading || step === 'done' || step === 'error') return

    const img = imgRef.current
    if (!img) return

    // Get click position relative to displayed image
    const rect = img.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    // Scale to actual screenshot dimensions (1280x800 viewport)
    const scaleX = img.naturalWidth / rect.width
    const scaleY = img.naturalHeight / rect.height
    const actualX = Math.round(clickX * scaleX)
    const actualY = Math.round(clickY * scaleY)

    setLoading(true)
    setError(null)

    try {
      const data = await callApi('click_coordinates', { x: actualX, y: actualY })
      if (!mountedRef.current) return
      if (data.screenshot) setScreenshot(data.screenshot)
      if (data.url) setCurrentUrl(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao interagir com o site')
    } finally {
      setLoading(false)
    }
  }

  /* -- Check result -------------------------------------------------------- */

  async function handleCheckResult() {
    setLoading(true)
    setError(null)
    setStep('emitting')

    try {
      const data = await callApi('check_result')
      if (!mountedRef.current) return

      if (data.screenshot) setScreenshot(data.screenshot)
      if (data.url) setCurrentUrl(data.url)

      if (data.result_status && data.result_status !== 'pending') {
        setStep('done')
        onSuccess()
      } else {
        setStep('captcha')
        setError('Certidao ainda nao emitida. Resolva o captcha e tente novamente.')
      }
    } catch (err) {
      setStep('captcha')
      setError(err instanceof Error ? err.message : 'Falha ao verificar resultado')
    } finally {
      setLoading(false)
    }
  }

  /* -- Render -------------------------------------------------------------- */

  const stepIndex = ['opening', 'filling', 'captcha', 'emitting', 'done'].indexOf(step)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-bold text-gray-900">
                Emitir {PORTAL_LABELS[portal] || portal}
              </h3>
              <p className="text-base text-gray-700 mt-0.5">
                {STEP_LABELS[step]}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-800 transition-colors p-1"
              title="Fechar"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1 mb-4">
            {['Abrindo', 'CNPJ', 'Captcha', 'Emitindo', 'Pronto'].map((label, i) => (
              <div key={label} className="flex items-center gap-1 flex-1">
                <div className={`h-2 rounded-full flex-1 transition-colors ${
                  i <= stepIndex && step !== 'error'
                    ? i === stepIndex ? 'bg-brand' : 'bg-emerald-400'
                    : 'bg-gray-200'
                }`} />
                <span className={`text-xs font-semibold shrink-0 ${
                  i <= stepIndex && step !== 'error' ? 'text-gray-900' : 'text-gray-400'
                }`}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* Status messages */}
          {step === 'done' && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 mb-4">
              <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-medium text-emerald-700">Certidao emitida e salva com sucesso!</span>
            </div>
          )}

          {step === 'error' && error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 mb-4">
              <p className="text-base font-medium text-red-800 mb-1">Erro na emissão</p>
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={() => {
                  setRetryCount(c => c + 1)
                  initSession()
                }}
                className="mt-3 bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-brand/90 transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {/* Screenshot — clickable */}
          <div className="relative mb-4 bg-gray-100 rounded-lg border border-gray-200 overflow-hidden min-h-[200px]">
            {screenshot ? (
              <img
                ref={imgRef}
                src={`data:image/jpeg;base64,${screenshot}`}
                alt="Site do governo"
                className="w-full rounded-lg cursor-crosshair"
                style={{ maxWidth: '800px' }}
                onClick={handleImageClick}
              />
            ) : (
              <div className="flex items-center justify-center h-[300px]">
                <svg className="animate-spin h-8 w-8 text-gray-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}
            {loading && (
              <div className="absolute inset-0 bg-white/30 flex items-center justify-center">
                <svg className="animate-spin h-6 w-6 text-brand" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}
            {step === 'captcha' && screenshot && (
              <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                Clique no captcha para resolver
              </div>
            )}
          </div>

          {/* URL indicator */}
          {currentUrl && (
            <p className="text-sm text-gray-600 mb-3 font-mono truncate">{currentUrl}</p>
          )}

          {/* Action buttons */}
          {step === 'captcha' && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCheckResult}
                disabled={loading}
                className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-brand/90 disabled:opacity-50 transition-colors"
              >
                Verificar resultado
              </button>
              <button
                onClick={async () => {
                  setLoading(true)
                  try {
                    const data = await callApi('screenshot')
                    if (data.screenshot) setScreenshot(data.screenshot)
                    if (data.url) setCurrentUrl(data.url)
                  } catch { /* silent */ } finally {
                    setLoading(false)
                  }
                }}
                disabled={loading}
                className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Atualizar
              </button>
            </div>
          )}

          {step === 'captcha' && error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 mt-3">
              <p className="text-sm text-amber-700">{error}</p>
            </div>
          )}

          {/* Footer for done state */}
          {step === 'done' && (
            <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={onClose}
                className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-brand/90 transition-colors"
              >
                Fechar
              </button>
            </div>
          )}

          {/* Hint */}
          <p className="text-sm text-gray-600 mt-4">
            Clique diretamente na imagem acima para interagir com o site. Apos resolver o captcha, clique em &ldquo;Verificar resultado&rdquo;.
          </p>
        </div>
      </div>
    </div>
  )
}
