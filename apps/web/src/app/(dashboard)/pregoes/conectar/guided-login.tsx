'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface GuidedLoginProps {
  onSuccess: () => void
  onCancel: () => void
}

export function GuidedLogin({ onSuccess, onCancel }: GuidedLoginProps) {
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'started' | 'logged_in' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [url, setUrl] = useState<string>('')

  // Start guided login session
  const startSession = useCallback(async () => {
    setLoading(true)
    setError(null)
    setStatus('idle')

    try {
      const res = await fetch('/api/pregao-chat/guided-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Erro ao iniciar sessão')
        return
      }

      setScreenshot(data.screenshot ? `data:image/jpeg;base64,${data.screenshot}` : null)
      setUrl(data.url || '')
      setStatus('started')
    } catch (err) {
      setError('Erro de conexão com o servidor de login')
    } finally {
      setLoading(false)
    }
  }, [])

  // Take screenshot (refresh view)
  const refreshScreenshot = useCallback(async () => {
    try {
      const res = await fetch('/api/pregao-chat/guided-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'screenshot' }),
      })
      const data = await res.json()
      if (data.screenshot) {
        setScreenshot(`data:image/jpeg;base64,${data.screenshot}`)
        setUrl(data.url || '')
      }
    } catch { /* ignore */ }
  }, [])

  // Handle click on screenshot
  const handleClick = useCallback(async (e: React.MouseEvent<HTMLImageElement>) => {
    if (status !== 'started') return

    const img = e.currentTarget
    const rect = img.getBoundingClientRect()

    // Calculate click position relative to the actual browser viewport (1280x800)
    const scaleX = 1280 / rect.width
    const scaleY = 800 / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)

    setLoading(true)
    try {
      const res = await fetch('/api/pregao-chat/guided-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'click',
          selector: `document.elementFromPoint(${x}, ${y})`,
        }),
      })
      // Clicking via selector won't work with coordinates — need to use page.click at coordinates
      // For now, refresh screenshot after a delay
      await new Promise(r => setTimeout(r, 2000))
      await refreshScreenshot()
    } finally {
      setLoading(false)
    }
  }, [status, refreshScreenshot])

  // Send keyboard input
  const handleType = useCallback(async (selector: string, value: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/pregao-chat/guided-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'type', selector, value }),
      })
      const data = await res.json()
      if (data.screenshot) {
        setScreenshot(`data:image/jpeg;base64,${data.screenshot}`)
        setUrl(data.url || '')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Check if logged in
  const checkLogin = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pregao-chat/guided-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cookies' }),
      })
      const data = await res.json()

      if (data.logged_in) {
        setStatus('logged_in')
        // Close the browser session
        await fetch('/api/pregao-chat/guided-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'close' }),
        })
        onSuccess()
      } else {
        setError('Login ainda não detectado. Continue o processo no portal e clique "Verificar Login" novamente.')
      }
    } catch {
      setError('Erro ao verificar login')
    } finally {
      setLoading(false)
    }
  }, [onSuccess])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      fetch('/api/pregao-chat/guided-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close' }),
      }).catch(() => { /* ignore */ })
    }
  }, [])

  // Auto-refresh screenshot every 3s while session is active
  useEffect(() => {
    if (status !== 'started') return
    const interval = setInterval(refreshScreenshot, 3000)
    return () => clearInterval(interval)
  }, [status, refreshScreenshot])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Login Guiado — Compras.gov.br</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'idle' && (
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">
              Vamos abrir o portal Compras.gov.br em um navegador seguro.
              Você fará o login normalmente (CPF, senha, captcha) e o Licitagram capturará a sessão automaticamente.
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={startSession} disabled={loading}>
                {loading ? 'Iniciando...' : 'Iniciar Login Guiado'}
              </Button>
              <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
            </div>
          </div>
        )}

        {status === 'started' && (
          <>
            {/* Browser view */}
            <div className="border rounded-lg overflow-hidden bg-gray-900">
              {/* URL bar */}
              <div className="bg-gray-800 px-3 py-1.5 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <div className="flex-1 bg-gray-700 rounded px-3 py-0.5 text-xs text-gray-300 truncate">
                  {url}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-gray-400 hover:text-white h-6 px-2 text-xs"
                  onClick={refreshScreenshot}
                >
                  ↻
                </Button>
              </div>

              {/* Screenshot */}
              {screenshot ? (
                <img
                  src={screenshot}
                  alt="Portal Compras.gov.br"
                  className="w-full cursor-pointer"
                  style={{ imageRendering: 'auto' }}
                />
              ) : (
                <div className="h-96 flex items-center justify-center text-gray-500">
                  Carregando...
                </div>
              )}
            </div>

            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <p className="font-medium mb-1">Instruções:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Clique em &quot;Entrar com Gov.br&quot; na tela acima</li>
                <li>Digite seu CPF e senha no portal gov.br</li>
                <li>Resolva o captcha se aparecer</li>
                <li>Quando estiver logado, clique &quot;Verificar Login&quot; abaixo</li>
              </ol>
            </div>

            {/* Quick actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => handleType('#accountId', '')}
                variant="outline"
                size="sm"
                disabled={loading}
              >
                Focar campo CPF
              </Button>
              <Button
                onClick={checkLogin}
                disabled={loading}
              >
                {loading ? 'Verificando...' : '✅ Verificar Login'}
              </Button>
              <Button variant="ghost" size="sm" onClick={onCancel}>
                Cancelar
              </Button>
            </div>
          </>
        )}

        {status === 'logged_in' && (
          <div className="text-center space-y-4">
            <div className="text-4xl">✅</div>
            <h3 className="text-lg font-semibold text-green-700">Login capturado com sucesso!</h3>
            <p className="text-muted-foreground">
              A sessão foi salva. Agora você pode adicionar pregões para monitorar.
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
      </CardContent>
    </Card>
  )
}
