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

type LoginStep = 'idle' | 'starting' | 'portal_loaded' | 'cpf_page' | 'password_page' | 'logged_in' | 'error'

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
      // Try multiple selectors for the gov.br button
      try {
        await callLogin('click', { selector: 'a[href*="acesso.gov.br"]' })
      } catch {
        try {
          await callLogin('click', { selector: 'a[href*="gov.br"]' })
        } catch {
          await callLogin('click', { selector: 'button' })
        }
      }
      // Wait for SSO page to load
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
      // Type CPF in the field
      await callLogin('type', { selector: '#accountId', value: cpf.replace(/\D/g, '') })
      // Click submit/continue
      await new Promise(r => setTimeout(r, 500))
      try {
        await callLogin('click', { selector: 'button[type="submit"]' })
      } catch {
        await callLogin('click', { selector: '[data-testid="select-cpf"]' })
      }
      await new Promise(r => setTimeout(r, 3000))
      await callLogin('screenshot')
      setLoginStep('password_page')
    } catch (err) {
      setError('Erro ao preencher CPF. O campo pode ter um seletor diferente.')
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
      await callLogin('type', { selector: '#password', value: senha })
      await new Promise(r => setTimeout(r, 500))
      await callLogin('click', { selector: 'button[type="submit"]' })
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
              <img src={screenshot} alt="Portal" className="w-full" />
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
        {['portal_loaded', 'cpf_page', 'password_page'].includes(loginStep) && (
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
