'use client'

import { useState, useEffect, useCallback } from 'react'

type ConnectionState = 'loading' | 'open' | 'connecting' | 'close' | 'error' | 'unknown'

export default function WhatsAppAdminPage() {
  const [state, setState] = useState<ConnectionState>('loading')
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [refreshCount, setRefreshCount] = useState(0)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/whatsapp', { cache: 'no-store' })
      const data = await res.json()
      if (data.error) {
        setState('error')
        setError(data.error)
        return
      }
      setState(data.state as ConnectionState)
      setQrBase64(data.qrBase64 || null)
      setError(null)
    } catch (err) {
      setState('error')
      setError('Falha ao conectar com a API')
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus, refreshCount])

  // Auto-refresh QR code every 30s when not connected
  useEffect(() => {
    if (state === 'open' || state === 'loading') return
    const interval = setInterval(() => {
      setRefreshCount((c) => c + 1)
    }, 30000)
    return () => clearInterval(interval)
  }, [state])

  const handleAction = async (action: 'restart' | 'logout') => {
    setActionLoading(true)
    try {
      await fetch('/api/admin/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      // Wait a bit then refresh
      setTimeout(() => {
        setRefreshCount((c) => c + 1)
        setActionLoading(false)
      }, 3000)
    } catch {
      setActionLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">WhatsApp Business</h1>
      <p className="text-sm text-gray-500 mb-6">
        Gerencie a conexao do WhatsApp via Evolution API
      </p>

      {/* Status Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Status da Conexao</h2>
          <StatusBadge state={state} />
        </div>

        {state === 'loading' && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
          </div>
        )}

        {state === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700">{error}</p>
            <p className="text-xs text-red-500 mt-1">
              Verifique se a Evolution API esta rodando no VPS (Docker)
            </p>
          </div>
        )}

        {state === 'open' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-700 font-medium">
              WhatsApp conectado e operacional
            </p>
            <p className="text-xs text-green-600 mt-1">
              Mensagens de notificacao serao enviadas automaticamente
            </p>
          </div>
        )}

        {(state === 'connecting' || state === 'close' || state === 'unknown') && qrBase64 && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-700 font-medium">
                Escaneie o QR Code com o WhatsApp
              </p>
              <p className="text-xs text-amber-600 mt-1">
                WhatsApp &rarr; Configuracoes &rarr; Dispositivos Conectados &rarr; Conectar Dispositivo
              </p>
            </div>

            <div className="flex justify-center p-4 bg-white border border-gray-100 rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrBase64}
                alt="WhatsApp QR Code"
                className="w-64 h-64"
              />
            </div>

            <p className="text-xs text-gray-400 text-center">
              O QR Code atualiza automaticamente a cada 30 segundos
            </p>
          </div>
        )}

        {(state === 'connecting' || state === 'close' || state === 'unknown') && !qrBase64 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">
              Nao foi possivel gerar o QR Code. Tente reiniciar a instancia.
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Acoes</h2>

        <div className="space-y-3">
          <button
            onClick={() => setRefreshCount((c) => c + 1)}
            className="w-full text-left px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <p className="text-sm font-medium text-gray-900">Atualizar Status</p>
            <p className="text-xs text-gray-500">Verificar conexao atual</p>
          </button>

          <button
            onClick={() => handleAction('restart')}
            disabled={actionLoading}
            className="w-full text-left px-4 py-3 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50"
          >
            <p className="text-sm font-medium text-amber-700">Reiniciar Instancia</p>
            <p className="text-xs text-amber-600">Reinicia a conexao sem deslogar</p>
          </button>

          <button
            onClick={() => handleAction('logout')}
            disabled={actionLoading}
            className="w-full text-left px-4 py-3 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <p className="text-sm font-medium text-red-700">Desconectar WhatsApp</p>
            <p className="text-xs text-red-600">Desloga o dispositivo (precisara escanear QR novamente)</p>
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Informacoes Tecnicas</h3>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
          <span>Evolution API</span>
          <span className="text-right font-mono">{process.env.NEXT_PUBLIC_EVOLUTION_API_URL || 'VPS local'}</span>
          <span>Instancia</span>
          <span className="text-right font-mono">licitagram</span>
          <span>Versao</span>
          <span className="text-right font-mono">v2.2.3</span>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ state }: { state: ConnectionState }) {
  const config: Record<string, { label: string; color: string }> = {
    loading: { label: 'Carregando...', color: 'bg-gray-100 text-gray-600' },
    open: { label: 'Conectado', color: 'bg-green-100 text-green-700' },
    connecting: { label: 'Aguardando QR', color: 'bg-amber-100 text-amber-700' },
    close: { label: 'Desconectado', color: 'bg-red-100 text-red-700' },
    error: { label: 'Erro', color: 'bg-red-100 text-red-700' },
    unknown: { label: 'Desconhecido', color: 'bg-gray-100 text-gray-600' },
  }

  const { label, color } = config[state] || config.unknown

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}
