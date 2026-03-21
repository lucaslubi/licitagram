'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface GuidedLoginProps {
  portal: string
  configId?: string
  onSuccess: (cookies: unknown[]) => void
  onClose: () => void
}

type LoginStep = 'connecting' | 'cpf' | 'password' | '2fa' | 'navigating' | 'connected' | 'error'

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function detectStep(url: string, prevStep: LoginStep): LoginStep {
  if (!url) return prevStep

  const lower = url.toLowerCase()

  // gov.br SSO pages
  if (lower.includes('acesso.gov.br') || lower.includes('sso.acesso.gov.br')) {
    if (lower.includes('authorize') || lower.includes('login')) {
      if (prevStep === 'cpf' || prevStep === 'connecting') return 'cpf'
      if (prevStep === 'password') return 'password'
      return prevStep
    }
    if (lower.includes('2fa') || lower.includes('otp') || lower.includes('mfa')) return '2fa'
    return prevStep
  }

  // If we left the SSO page, we're likely logged in
  if (prevStep === 'password' || prevStep === '2fa') {
    return 'connected'
  }

  return prevStep
}

const STEP_LABELS: Record<LoginStep, string> = {
  connecting: 'Conectando ao portal...',
  cpf: 'Digite seu CPF',
  password: 'Digite sua senha',
  '2fa': 'Digite o codigo 2FA',
  navigating: 'Navegando...',
  connected: 'Conectado!',
  error: 'Erro na conexao',
}

const STEP_PLACEHOLDERS: Record<LoginStep, string> = {
  connecting: '',
  cpf: '000.000.000-00',
  password: 'Senha do portal',
  '2fa': 'Codigo de verificacao',
  navigating: '',
  connected: '',
  error: '',
}

/* ── Component ──────────────────────────────────────────────────────────────── */

export function GuidedLogin({ portal, configId, onSuccess, onClose }: GuidedLoginProps) {
  const [sessionId] = useState(() => crypto.randomUUID())
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [step, setStep] = useState<LoginStep>('connecting')
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUrl, setCurrentUrl] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  /* ── API call helper ─────────────────────────────────────────────────────── */

  const callApi = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const res = await fetch('/api/bot/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        session_id: sessionId,
        config_id: configId,
        portal,
        ...extra,
      }),
    })
    return res.json()
  }, [sessionId, configId, portal])

  /* ── Start session on mount ──────────────────────────────────────────────── */

  useEffect(() => {
    mountedRef.current = true

    async function init() {
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
        setStep('cpf')
      } catch {
        if (!mountedRef.current) return
        setError('Falha ao conectar ao servidor de login')
        setStep('error')
      }
    }

    init()

    return () => {
      mountedRef.current = false
      // Close session on unmount
      callApi('close').catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Auto-poll screenshots ───────────────────────────────────────────────── */

  useEffect(() => {
    if (step === 'connected' || step === 'error' || step === 'connecting') {
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
        if (data.url) {
          setCurrentUrl(data.url)
          setStep(prev => detectStep(data.url, prev))
        }
      } catch {
        // Silent
      }
    }, 3000)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [step, loading, callApi])

  /* ── Check for connected status ──────────────────────────────────────────── */

  useEffect(() => {
    if (step !== 'connected') return

    async function checkCookies() {
      try {
        const data = await callApi('cookies')
        if (data.logged_in && data.cookies) {
          onSuccess(data.cookies)
        }
      } catch {
        // Silent
      }
    }

    checkCookies()
  }, [step, callApi, onSuccess])

  /* ── Action handlers ─────────────────────────────────────────────────────── */

  async function handleType() {
    if (!inputValue.trim() || loading) return
    setLoading(true)
    setError(null)

    try {
      // Determine the selector based on the current step
      let selector = 'input:visible'
      if (step === 'cpf') selector = 'input[type="text"]:visible, input[name="accountId"]:visible, input#accountId'
      else if (step === 'password') selector = 'input[type="password"]:visible'
      else if (step === '2fa') selector = 'input[type="text"]:visible, input[type="number"]:visible'

      const data = await callApi('type', { selector, value: inputValue })
      if (!mountedRef.current) return

      if (data.screenshot) setScreenshot(data.screenshot)
      if (data.url) setCurrentUrl(data.url)
      setInputValue('')
    } catch {
      setError('Falha ao digitar')
    } finally {
      setLoading(false)
    }
  }

  async function handleClick(selector?: string) {
    setLoading(true)
    setError(null)

    try {
      const clickSelector = selector || 'button[type="submit"]:visible, button.primary:visible, input[type="submit"]:visible'
      const data = await callApi('click', { selector: clickSelector })
      if (!mountedRef.current) return

      if (data.screenshot) setScreenshot(data.screenshot)
      if (data.url) {
        setCurrentUrl(data.url)
        // Advance step after clicking submit
        if (step === 'cpf') setStep('password')
        else if (step === 'password') {
          const newStep = detectStep(data.url, 'password')
          setStep(newStep === 'password' ? 'navigating' : newStep)
          // Check if we got connected
          if (newStep !== 'password' && newStep !== '2fa') {
            setTimeout(() => setStep(prev => prev === 'navigating' ? 'connected' : prev), 2000)
          }
        }
        else if (step === '2fa') {
          setStep('navigating')
          setTimeout(() => setStep(prev => prev === 'navigating' ? 'connected' : prev), 2000)
        }
      }
    } catch {
      setError('Falha ao clicar')
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setLoading(true)
    try {
      const data = await callApi('screenshot')
      if (!mountedRef.current) return
      if (data.screenshot) setScreenshot(data.screenshot)
      if (data.url) {
        setCurrentUrl(data.url)
        setStep(prev => detectStep(data.url, prev))
      }
    } catch {
      setError('Falha ao atualizar')
    } finally {
      setLoading(false)
    }
  }

  /* ── Render ───────────────────────────────────────────────────────────────── */

  const showInput = step === 'cpf' || step === 'password' || step === '2fa'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Login Guiado</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {STEP_LABELS[step]}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Fechar"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Status indicator */}
          <div className="mb-4">
            {step === 'connecting' && (
              <div className="flex items-center gap-2 text-blue-600">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm font-medium">Abrindo navegador...</span>
              </div>
            )}
            {step === 'connected' && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium text-emerald-700">Conectado com sucesso!</span>
              </div>
            )}
            {step === 'error' && error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </div>

          {/* Screenshot */}
          <div className="relative mb-4 bg-gray-100 rounded-lg border border-gray-200 overflow-hidden min-h-[200px]">
            {screenshot ? (
              <img
                src={`data:image/jpeg;base64,${screenshot}`}
                alt="Portal screenshot"
                className="w-full rounded-lg"
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
          </div>

          {/* URL indicator */}
          {currentUrl && (
            <p className="text-xs text-gray-400 mb-3 font-mono truncate">{currentUrl}</p>
          )}

          {/* Input + action buttons */}
          {showInput && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {step === 'cpf' ? 'CPF' : step === 'password' ? 'Senha' : 'Codigo 2FA'}
                </label>
                <input
                  type={step === 'password' ? 'password' : 'text'}
                  placeholder={STEP_PLACEHOLDERS[step]}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleType()
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none"
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleType}
                  disabled={loading || !inputValue.trim()}
                  className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-brand/90 disabled:opacity-50 transition-colors"
                >
                  Digitar
                </button>
                <button
                  onClick={() => handleClick()}
                  disabled={loading}
                  className="bg-gray-800 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  Clicar
                </button>
                <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Atualizar
                </button>
              </div>

              {error && !['error', 'connected'].includes(step) && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Footer for connected state */}
          {step === 'connected' && (
            <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={onClose}
                className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-brand/90 transition-colors"
              >
                Fechar
              </button>
            </div>
          )}

          {/* Footer for navigating state */}
          {step === 'navigating' && (
            <div className="flex items-center gap-2 text-blue-600 mt-3">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm font-medium">Verificando login...</span>
            </div>
          )}

          {/* Hint text */}
          <p className="text-xs text-gray-400 mt-4">
            O navegador esta rodando no servidor. Digite suas credenciais acima para fazer login no portal.
          </p>
        </div>
      </div>
    </div>
  )
}
