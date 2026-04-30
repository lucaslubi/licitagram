'use client'

/**
 * TelegramConnect — instruções de handshake com @LicitagramBot.
 *
 * Como o bot atualiza users.telegram_chat_id via webhook quando o usuário
 * envia /start <email>, não há fluxo de envio de código aqui. Mostramos
 * instruções quando desconectado e botão "Desconectar" quando conectado.
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type Props = {
  email: string | null
  telegramChatId: number | string | null
}

export function TelegramConnect({ email, telegramChatId }: Props) {
  const [chatId, setChatId] = useState<number | string | null>(telegramChatId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function disconnect() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/telegram/disconnect', { method: 'POST' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Erro ao desconectar')
        return
      }
      setChatId(null)
    } catch {
      setError('Erro de conexão')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-500" fill="currentColor" aria-hidden>
            <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/>
          </svg>
          Telegram
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {chatId ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-600">Conectado</Badge>
                <span className="text-sm text-muted-foreground">Chat ID: {String(chatId)}</span>
              </div>
              <Button variant="outline" size="sm" onClick={disconnect} disabled={busy}>
                {busy ? 'Desconectando...' : 'Desconectar'}
              </Button>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        ) : (
          <div className="text-sm space-y-2">
            <p className="text-muted-foreground">Para receber alertas no Telegram:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>
                Abra o Telegram e busque por <strong>@LicitagramBot</strong>
              </li>
              <li>
                Envie:{' '}
                <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-xs">
                  /start {email || 'seu@email.com'}
                </code>
              </li>
              <li>Pronto — alertas começam automaticamente.</li>
            </ol>
            <p className="text-xs text-muted-foreground pt-1">
              Se já fez isso e não conectou, recarregue esta página.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
