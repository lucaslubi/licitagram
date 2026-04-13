'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { formatPhoneBR } from '@/lib/format'

type Status = 'idle' | 'sending' | 'code_sent' | 'verifying' | 'connected'


export function WhatsAppConnect() {
  const [status, setStatus] = useState<Status>('idle')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [maskedNumber, setMaskedNumber] = useState('')
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status')
      if (!res.ok) return
      const data = await res.json()
      if (data.connected) {
        setStatus('connected')
        setMaskedNumber(data.number || '')
        setVerifiedAt(data.verifiedAt)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const sendCode = async () => {
    setError('')
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10 || digits.length > 11) {
      setError('Informe um número de celular válido')
      return
    }

    setStatus('sending')
    try {
      const res = await fetch('/api/whatsapp/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erro ao enviar código')
        setStatus('idle')
        return
      }
      setStatus('code_sent')
    } catch {
      setError('Erro de conexão')
      setStatus('idle')
    }
  }

  const verifyCode = async () => {
    setError('')
    if (code.length !== 6) {
      setError('Digite o código de 6 dígitos')
      return
    }

    setStatus('verifying')
    try {
      const res = await fetch('/api/whatsapp/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erro ao verificar')
        setStatus('code_sent')
        return
      }
      setStatus('connected')
      setMaskedNumber('****' + (data.phone || '').slice(-4))
      setVerifiedAt(new Date().toISOString())
    } catch {
      setError('Erro de conexão')
      setStatus('code_sent')
    }
  }

  const disconnect = async () => {
    try {
      const res = await fetch('/api/whatsapp/disconnect', { method: 'POST' })
      if (res.ok) {
        setStatus('idle')
        setPhone('')
        setCode('')
        setMaskedNumber('')
        setVerifiedAt(null)
      }
    } catch {
      // ignore
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-green-500" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'connected' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-green-600">Conectado</Badge>
                <span className="text-sm text-muted-foreground">{maskedNumber}</span>
              </div>
              <Button variant="outline" size="sm" onClick={disconnect}>
                Desconectar
              </Button>
            </div>
            {verifiedAt && (
              <p className="text-xs text-muted-foreground">
                Verificado em {new Date(verifiedAt).toLocaleDateString('pt-BR')}
              </p>
            )}
          </div>
        ) : status === 'code_sent' || status === 'verifying' ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enviamos um código de 6 dígitos para seu WhatsApp.
            </p>
            <div>
              <Label htmlFor="wa-code">Código de verificação</Label>
              <Input
                id="wa-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center text-2xl tracking-widest font-mono mt-1"
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button
                onClick={verifyCode}
                disabled={status === 'verifying' || code.length !== 6}
                className="flex-1"
              >
                {status === 'verifying' ? 'Verificando...' : 'Verificar'}
              </Button>
              <Button variant="outline" onClick={() => { setStatus('idle'); setCode(''); setError('') }}>
                Voltar
              </Button>
            </div>
            <button
              onClick={sendCode}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Reenviar código
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Conecte seu WhatsApp para receber alertas de licitações.
            </p>
            <div>
              <Label htmlFor="wa-phone">Número de celular</Label>
              <Input
                id="wa-phone"
                type="tel"
                placeholder="(11) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(formatPhoneBR(e.target.value))}
                className="mt-1"
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button
              onClick={sendCode}
              disabled={status === 'sending'}
              className="w-full"
            >
              {status === 'sending' ? 'Enviando...' : 'Enviar Código de Verificação'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
