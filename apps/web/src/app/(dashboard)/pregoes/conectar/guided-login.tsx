'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface GuidedLoginProps {
  onSuccess: () => void
  onCancel: () => void
}

type LoginStep = 'idle' | 'starting' | 'portal_loaded' | 'cpf_page' | 'captcha_page' | 'password_page' | 'logged_in' | 'error'

export function GuidedLogin({ onSuccess, onCancel }: GuidedLoginProps) {
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loginStep, setLoginStep] = useState<LoginStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [url, setUrl] = useState<string>('')
  const [cpf, setCpf] = useState('')
  const [senha, setSenha] = useState('')
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── API helper ───────────────────────────────────────────────────────

  const callLogin = useCallback(async (action: string, params: Record<string, unknown> = {}) => {
    const res = await fetch('/api/pregao-chat/guided-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...params }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Erro')
    if (data.screenshot) {
      setScreenshot(`data:image/jpeg;base64,${data.screenshot}`)
    }
    if (data.url) setUrl(data.url)
    return data
  }, [])

  // ─── Auto-refresh screenshot ──────────────────────────────────────────

  const startRefresh = useCallback(() => {
    if (refreshRef.current) clearInterval(refreshRef.current)
    refreshRef.current = setInterval(async () => {
      try {
        await callLogin('screenshot')
      } catch { /* ignore */ }
    }, 4000)
  }, [callLogin])

  const stopRefresh = useCallback(() => {
    if (refreshRef.current) {
      clearInterval(refreshRef.current)
      refreshRef.current = null
    }
  }, [])

  useEffect(() => () => stopRefresh(), [stopRefresh])

  // ─── Step 1: Start session ────────────────────────────────────────────

  const startSession = useCallback(async () => {
    setLoading(true)
    setError(null)
    setLoginStep('starting')
    try {
      await callLogin('start')
      setLoginStep('portal_loaded')
      startRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar')
      setLoginStep('error')
    } finally {
      setLoading(false)
    }
  }, [callLogin, startRefresh])

  // ─── Step 2: Click "Entrar com Gov.br" ────────────────────────────────

  const clickGovBr = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // button.br-button.is-primary is the "Entrar com Gov.br" button on comprasnet
      await callLogin('click', {
        selector: 'button.br-button.is-primary || button.is-primary || text:Entrar com Gov.br'
      })
      await new Promise(r => setTimeout(r, 3000))
      await callLogin('screenshot')
      setLoginStep('cpf_page')
    } catch (err) {
      setError('Não encontrou o botão "Entrar com Gov.br". Tente atualizar a tela.')
    } finally {
      setLoading(false)
    }
  }, [callLogin])

  // ─── Step 3: Submit CPF ───────────────────────────────────────────────

  const submitCpf = useCallback(async () => {
    if (!cpf.replace(/\D/g, '')) {
      setError('Digite seu CPF')
      return
    }
    setLoading(true)
    setError(null)
    try {
      // Type CPF — try multiple selectors for the input field
      await callLogin('type', {
        selector: '#accountId || input[name="accountId"] || input[type="text"] || input[inputmode="numeric"]',
        value: cpf.replace(/\D/g, ''),
      })
      await new Promise(r => setTimeout(r, 500))
      // Click submit/continue
      await callLogin('click', {
        selector: 'button[type="submit"] || input[type="submit"] || text:Continuar || text:Avançar || text:Próximo',
      })
      await new Promise(r => setTimeout(r, 3000))
      const result = await callLogin('screenshot')

      // DETECT CAPTCHA AUTOMATICALLY — only go to captcha_page if captcha is present
      // If no captcha detected, skip directly to password page
      const hasCaptcha = result?.has_captcha === true
      if (hasCaptcha) {
        setLoginStep('captcha_page')
      } else {
        // Skip captcha step — go directly to password
        setLoginStep('password_page')
      }
    } catch (err) {
      setError('Erro ao preencher CPF. Tente atualizar a tela e verifique se o campo está visível.')
    } finally {
      setLoading(false)
    }
  }, [cpf, callLogin])

  // ─── Step 4: Submit senha ─────────────────────────────────────────────

  const submitSenha = useCallback(async () => {
    if (!senha) {
      setError('Digite sua senha')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await callLogin('type', {
        selector: '#password || input[name="password"] || input[type="password"]',
        value: senha,
      })
      await new Promise(r => setTimeout(r, 500))
      await callLogin('click', {
        selector: 'button[type="submit"] || input[type="submit"] || text:Entrar || text:Acessar',
      })
      // Wait for redirect
      await new Promise(r => setTimeout(r, 5000))
      await callLogin('screenshot')
      // Check if logged in
      await checkLogin()
    } catch (err) {
      setError('Erro ao enviar senha. Verifique se a senha está correta.')
      await callLogin('screenshot').catch(() => {})
    } finally {
      setLoading(false)
    }
  }, [senha, callLogin])

  // ─── Click on screenshot (for captcha, etc) ───────────────────────────

  const handleScreenshotClick = useCallback(async (e: React.MouseEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const rect = img.getBoundingClientRect()
    // Map click position to browser viewport (1280x800)
    const x = Math.round((e.clientX - rect.left) * (1280 / rect.width))
    const y = Math.round((e.clientY - rect.top) * (800 / rect.height))

    setLoading(true)
    try {
      await callLogin('click_xy', { x, y })
      await new Promise(r => setTimeout(r, 1500))
      await callLogin('screenshot')
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [callLogin])

  // ─── Check login status ───────────────────────────────────────────────

  const checkLogin = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await callLogin('cookies')
      if (data.logged_in) {
        setLoginStep('logged_in')
        stopRefresh()
        await callLogin('close').catch(() => {})
        onSuccess()
      } else {
        setError('Login ainda não detectado. Se acabou de logar, aguarde uns segundos e clique "Verificar" novamente.')
      }
    } catch (err) {
      setError('Erro ao verificar login')
    } finally {
      setLoading(false)
    }
  }, [callLogin, stopRefresh, onSuccess])

  // ─── Cleanup ──────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopRefresh()
      fetch('/api/pregao-chat/guided-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close' }),
      }).catch(() => {})
    }
  }, [stopRefresh])

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <CardTitle>Login Guiado — Compras.gov.br</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Idle state */}
        {loginStep === 'idle' && (
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">
              Vamos abrir o portal Compras.gov.br em um navegador seguro.
              Você digitará seu CPF e senha aqui, e o Licitagram preencherá no portal automaticamente.
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={startSession} disabled={loading}>
                {loading ? 'Iniciando...' : 'Iniciar Login Guiado'}
              </Button>
              <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
            </div>
          </div>
        )}

        {/* Browser view (shown for all active states) */}
        {loginStep !== 'idle' && loginStep !== 'logged_in' && (
          <div className="border rounded-lg overflow-hidden bg-gray-900">
            <div className="bg-gray-800 px-3 py-1.5 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <div className="flex-1 bg-gray-700 rounded px-3 py-0.5 text-xs text-gray-300 truncate">
                {url || 'Carregando...'}
              </div>
            </div>
            {screenshot ? (
              <img
                src={screenshot}
                alt="Portal — clique para interagir"
                className="w-full cursor-crosshair"
                onClick={handleScreenshotClick}
                title="Clique na imagem para interagir com o portal (resolver captcha, etc)"
              />
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
              </div>
            )}
          </div>
        )}

        {/* Portal loaded — click "Entrar com Gov.br" */}
        {loginStep === 'portal_loaded' && (
          <div className="space-y-3">
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
              <p className="font-medium">Passo 1: Acessar login gov.br</p>
              <p className="text-muted-foreground">Clique no botão abaixo para acessar a página de login do gov.br</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={clickGovBr} disabled={loading}>
                {loading ? 'Acessando...' : 'Clicar "Entrar com Gov.br"'}
              </Button>
              <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
            </div>
          </div>
        )}

        {/* CPF page */}
        {loginStep === 'cpf_page' && (
          <div className="space-y-3">
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
              <p className="font-medium">Passo 2: Informe seu CPF</p>
              <p className="text-muted-foreground">Digite seu CPF abaixo e clique Continuar</p>
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="guided-cpf">CPF</Label>
                <Input
                  id="guided-cpf"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  onKeyDown={(e) => e.key === 'Enter' && submitCpf()}
                />
              </div>
              <Button onClick={submitCpf} disabled={loading}>
                {loading ? 'Enviando...' : 'Continuar'}
              </Button>
            </div>
          </div>
        )}

        {/* Captcha page — auto-solve via CapSolver */}
        {loginStep === 'captcha_page' && (
          <div className="space-y-3">
            <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-sm">
              <p className="font-medium">Passo 3: Resolver captcha</p>
              <p className="text-muted-foreground">
                O gov.br exige captcha. Clique em &quot;Resolver Captcha&quot; para resolver automaticamente (pode levar até 30s).
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={async () => {
                setLoading(true)
                setError(null)
                try {
                  const data = await callLogin('solve_captcha')
                  if (data.solved) {
                    // After solving, try to submit the CPF form again
                    await new Promise(r => setTimeout(r, 1000))
                    try {
                      await callLogin('click', {
                        selector: 'button[type="submit"] || input[type="submit"] || text:Continuar',
                      })
                    } catch { /* submit may have auto-triggered */ }
                    await new Promise(r => setTimeout(r, 3000))
                    await callLogin('screenshot')
                    setLoginStep('password_page')
                  } else {
                    setError(data.error || 'Falha ao resolver captcha. Tente novamente.')
                  }
                } catch (err) {
                  setError('Erro ao resolver captcha. Verifique se a conta do Anti-Captcha tem saldo (anti-captcha.com).')
                } finally {
                  setLoading(false)
                }
              }} disabled={loading}>
                {loading ? 'Resolvendo captcha...' : 'Resolver Captcha Automaticamente'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setLoginStep('password_page')} disabled={loading}>
                Pular (sem captcha)
              </Button>
              <Button variant="ghost" size="sm" onClick={async () => { await callLogin('screenshot').catch(() => {}); }}>
                Atualizar Tela
              </Button>
            </div>
          </div>
        )}

        {/* Password page */}
        {loginStep === 'password_page' && (
          <div className="space-y-3">
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
              <p className="font-medium">Passo 3: Informe sua senha gov.br</p>
              <p className="text-muted-foreground">Digite sua senha e clique Entrar. Se aparecer captcha na tela acima, aguarde a resolução.</p>
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="guided-senha">Senha gov.br</Label>
                <Input
                  id="guided-senha"
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Sua senha"
                  onKeyDown={(e) => e.key === 'Enter' && submitSenha()}
                />
              </div>
              <Button onClick={submitSenha} disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar'}
              </Button>
            </div>
          </div>
        )}

        {/* Verify button (always available during active session) */}
        {['portal_loaded', 'cpf_page', 'captcha_page', 'password_page'].includes(loginStep) && (
          <div className="flex gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={checkLogin} disabled={loading}>
              Verificar Login
            </Button>
            <Button variant="ghost" size="sm" onClick={async () => { await callLogin('screenshot').catch(() => {}); }}>
              Atualizar Tela
            </Button>
          </div>
        )}

        {/* Success */}
        {loginStep === 'logged_in' && (
          <div className="text-center space-y-4">
            <div className="text-5xl">✅</div>
            <h3 className="text-lg font-semibold text-green-700">Login capturado com sucesso!</h3>
            <p className="text-muted-foreground">
              A sessão foi salva. Agora você pode adicionar pregões para monitorar.
            </p>
          </div>
        )}

        {/* Error */}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </CardContent>
    </Card>
  )
}
