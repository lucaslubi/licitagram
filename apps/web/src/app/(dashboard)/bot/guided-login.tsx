'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface GuidedLoginProps {
  portal: string
  configId?: string
  onSuccess: (cookies: unknown[]) => void
  onClose: () => void
}

type LoginStep = 'connecting' | 'cpf' | 'solving_captcha' | 'password' | '2fa' | 'navigating' | 'connected' | 'error'

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
  solving_captcha: 'Resolvendo captcha automaticamente...',
  password: 'Digite sua senha',
  '2fa': 'Digite o codigo 2FA',
  navigating: 'Navegando...',
  connected: 'Conectado!',
  error: 'Erro na conexao',
}

const STEP_PLACEHOLDERS: Record<LoginStep, string> = {
  connecting: '',
  cpf: '000.000.000-00',
  solving_captcha: '',
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
      callApi('close').catch(() => { })
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

  /**
   * Combined action: type the value into the correct input, then click the
   * Continue / Entrar / Submit button. This is what users actually want —
   * a single "Enviar" click that advances to the next step.
   */
  async function handleSubmit() {
    if (!inputValue.trim() || loading) return
    setLoading(true)
    setError(null)

    try {
      // 1. Type value into the correct field
      let inputSelector = 'input:visible'
      let submitSelector = 'button[type="submit"]:visible, button.br-button.is-primary:visible'
      if (step === 'cpf') {
        inputSelector = 'input[name="accountId"], input#accountId, input[type="text"]'
        submitSelector = 'button[type="submit"], button.br-button.is-primary, button:contains("Continuar"), button:contains("Próxima")'
      } else if (step === 'password') {
        inputSelector = 'input[type="password"], input[name="password"], input#password'
        submitSelector = 'button[type="submit"], button.br-button.is-primary, button:contains("Entrar")'
      } else if (step === '2fa') {
        inputSelector = 'input[name="codigo"], input[autocomplete="one-time-code"], input[type="text"]'
        submitSelector = 'button[type="submit"], button.br-button.is-primary'
      }

      // Sanitize CPF client-side before sending
      const clean = step === 'cpf' ? inputValue.replace(/\D/g, '') : inputValue
      await callApi('type', { selector: inputSelector, value: clean })

      // 2. Click submit
      const clickData = await callApi('click', { selector: submitSelector })
      if (!mountedRef.current) return

      if (clickData.screenshot) setScreenshot(clickData.screenshot)
      if (clickData.url) setCurrentUrl(clickData.url)
      setInputValue('')

      // 3. After CPF submit, Gov.br often triggers hCaptcha. Detect via
      //    screenshot's has_captcha flag (returned on subsequent screenshot
      //    call) and fire auto-solve.
      if (step === 'cpf') {
        setStep('solving_captcha')
        // Small wait for the captcha to render
        await new Promise(r => setTimeout(r, 1500))
        const check = await callApi('screenshot')
        if (!mountedRef.current) return
        if (check.screenshot) setScreenshot(check.screenshot)
        if (check.url) setCurrentUrl(check.url)

        if (check.has_captcha) {
          // Kick the solver; can take 15-60s for hCaptcha
          const solve = await callApi('solve_captcha')
          if (!mountedRef.current) return
          if (solve.solved) {
            if (solve.screenshot) setScreenshot(solve.screenshot)
            // Try auto-clicking Continue again if there is one
            await callApi('click', { selector: submitSelector }).catch(() => null)
            await new Promise(r => setTimeout(r, 1500))
            const after = await callApi('screenshot')
            if (!mountedRef.current) return
            if (after.screenshot) setScreenshot(after.screenshot)
            if (after.url) setCurrentUrl(after.url)
          } else {
            setError(`Não conseguimos resolver o captcha automaticamente (${solve.reason || 'tente novamente'}).`)
          }
        }
        setStep('password')
      } else if (step === 'password') {
        setStep('navigating')
      }
    } catch {
      setError('Falha ao enviar. Tente novamente ou clique Atualizar.')
    } finally {
      setLoading(false)
    }
  }

  // Kept for backward compat — only used internally by handleSubmit now.
  async function handleType() {
    return handleSubmit()
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
      <div className="bg-[#1a1c1f] rounded-xl border shadow-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Login Guiado no Compras.gov.br</h3>
              <p className="text-sm text-gray-400 mt-0.5">
                {step === 'cpf' && 'Digite seu CPF abaixo. O portal está aguardando.'}
                {step === 'solving_captcha' && 'Resolvendo captcha automaticamente (pode levar até 60s)…'}
                {step === 'password' && 'CPF aceito. Agora digite sua senha gov.br.'}
                {step === '2fa' && 'Digite o código de verificação do seu app gov.br.'}
                {step === 'connecting' && 'Conectando ao portal…'}
                {step === 'navigating' && 'Confirmando login…'}
                {step === 'connected' && 'Logado! Salvando sessão…'}
                {step === 'error' && 'Algo deu errado. Feche e tente novamente.'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
              title="Fechar"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress indicator */}
          <div className="flex items-center gap-1 mb-4">
            {(['cpf', 'password', 'connected'] as const).map((s, idx) => {
              const isActive = step === s || (step === 'navigating' && s === 'password')
              const isDone =
                (s === 'cpf' && (step === 'password' || step === '2fa' || step === 'navigating' || step === 'connected')) ||
                (s === 'password' && (step === 'navigating' || step === 'connected')) ||
                (s === 'connected' && step === 'connected')
              return (
                <div key={s} className="flex items-center gap-1 flex-1">
                  <div
                    className={`flex-1 h-1 rounded-full transition-colors ${
                      isDone ? 'bg-emerald-500' : isActive ? 'bg-brand' : 'bg-white/10'
                    }`}
                  />
                  {idx < 2 && <span className="w-0.5" />}
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-gray-400 mb-4 font-mono">
            <span>1. CPF</span>
            <span>2. Senha</span>
            <span>3. Sessão salva</span>
          </div>

          {/* Status indicator */}
          <div className="mb-4">
            {step === 'connecting' && (
              <div className="flex items-center gap-2 text-blue-400">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm font-medium">Abrindo navegador...</span>
              </div>
            )}
            {step === 'connected' && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-900/20 border border-emerald-900/30 px-3 py-2">
                <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium text-emerald-400">Conectado com sucesso!</span>
              </div>
            )}
            {step === 'error' && error && (
              <div className="rounded-lg border border-red-900/30 bg-red-900/20 px-3 py-2">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
          </div>

          {/* Screenshot */}
          <div className="relative mb-4 bg-[#2d2f33] rounded-lg border border-[#2d2f33] overflow-hidden min-h-[200px]">
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
              <div className="absolute inset-0 bg-white/10 flex items-center justify-center">
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
                <label className="block text-sm font-medium text-gray-300 mb-1">
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
                  className="w-full border border-[#2d2f33] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none"
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSubmit}
                  disabled={loading || !inputValue.trim()}
                  className="bg-brand text-white rounded-lg px-5 py-2 text-sm font-semibold hover:bg-brand-dark disabled:opacity-50 transition-colors"
                >
                  {step === 'cpf' ? 'Enviar CPF →' : step === 'password' ? 'Entrar →' : 'Verificar código →'}
                </button>
                <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="border border-[#2d2f33] text-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#1a1c1f] disabled:opacity-50 transition-colors"
                  title="Atualizar screenshot"
                >
                  ↻ Atualizar
                </button>
              </div>

              {error && !['error', 'connected'].includes(step) && (
                <div className="rounded-lg border border-red-900/30 bg-red-900/20 px-3 py-2">
                  <p className="text-sm text-red-400">{error}</p>
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
            <div className="flex items-center gap-2 text-blue-400 mt-3">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm font-medium">Verificando login...</span>
            </div>
          )}

          {/* Hint text */}
          <div className="mt-4 space-y-1.5">
            <p className="text-xs text-gray-400">
              💡 <strong className="text-gray-300">Como funciona:</strong> o navegador real está rodando no servidor Licitagram.
              Acima você vê o que ele está vendo. Quando preencher CPF e clicar Enviar,
              digitamos no portal por você e clicamos Continuar automaticamente.
            </p>
            <p className="text-xs text-gray-400">
              🔐 Suas credenciais são criptografadas com AES-256-GCM antes de sair do seu navegador.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
