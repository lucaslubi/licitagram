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
      <h1 className="text-2xl font-bold text-white mb-1">WhatsApp Business</h1>
      <p className="text-sm text-gray-400 mb-6">
        Gerencie a conexao do WhatsApp via Evolution API
      </p>

      {/* Status Card */}
      <div className="bg-[#23262a] border border-[#2d2f33] rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Status da Conexao</h2>
          <StatusBadge state={state} />
        </div>

        {state === 'loading' && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
          </div>
        )}

        {state === 'error' && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
            <p className="text-sm text-red-400">{error}</p>
            <p className="text-xs text-red-400 mt-1">
              Verifique se a Evolution API esta rodando no VPS (Docker)
            </p>
          </div>
        )}

        {state === 'open' && (
          <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
            <p className="text-sm text-green-400 font-medium">
              WhatsApp conectado e operacional
            </p>
            <p className="text-xs text-green-400 mt-1">
              Mensagens de notificação serão enviadas automaticamente
            </p>
          </div>
        )}

        {(state === 'connecting' || state === 'close' || state === 'unknown') && qrBase64 && (
          <div className="space-y-4">
            <div className="bg-amber-900/20 border border-amber-800 rounded-lg p-4">
              <p className="text-sm text-amber-400 font-medium">
                Escaneie o QR Code com o WhatsApp
              </p>
              <p className="text-xs text-amber-400 mt-1">
                WhatsApp &rarr; Configurações &rarr; Dispositivos Conectados &rarr; Conectar Dispositivo
              </p>
            </div>

            <div className="flex justify-center p-4 bg-[#23262a] border border-[#2d2f33] rounded-lg">
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
          <div className="bg-[#1a1c1f] border border-[#2d2f33] rounded-lg p-4">
            <p className="text-sm text-gray-400">
              Não foi possível gerar o QR Code. Tente reiniciar a instância.
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="bg-[#23262a] border border-[#2d2f33] rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Ações</h2>

        <div className="space-y-3">
          <button
            onClick={() => setRefreshCount((c) => c + 1)}
            className="w-full text-left px-4 py-3 border border-[#2d2f33] rounded-lg hover:bg-[#2d2f33] transition-colors"
          >
            <p className="text-sm font-medium text-white">Atualizar Status</p>
            <p className="text-xs text-gray-400">Verificar conexão atual</p>
          </button>

          <button
            onClick={() => handleAction('restart')}
            disabled={actionLoading}
            className="w-full text-left px-4 py-3 border border-amber-800 rounded-lg hover:bg-amber-900/20 transition-colors disabled:opacity-50"
          >
            <p className="text-sm font-medium text-amber-400">Reiniciar Instância</p>
            <p className="text-xs text-amber-400">Reinicia a conexão sem deslogar</p>
          </button>

          <button
            onClick={() => handleAction('logout')}
            disabled={actionLoading}
            className="w-full text-left px-4 py-3 border border-red-800 rounded-lg hover:bg-red-900/30 transition-colors disabled:opacity-50"
          >
            <p className="text-sm font-medium text-red-400">Desconectar WhatsApp</p>
            <p className="text-xs text-red-400">Desloga o dispositivo (precisará escanear QR novamente)</p>
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="mt-6 p-4 bg-[#1a1c1f] border border-[#2d2f33] rounded-lg">
        <h3 className="text-sm font-medium text-gray-300 mb-2">Informações Técnicas</h3>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
          <span>Evolution API</span>
          <span className="text-right font-mono">{process.env.NEXT_PUBLIC_EVOLUTION_API_URL || 'VPS local'}</span>
          <span>Instância</span>
          <span className="text-right font-mono">licitagram</span>
          <span>Versão</span>
          <span className="text-right font-mono">v2.2.3</span>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ state }: { state: ConnectionState }) {
  const config: Record<string, { label: string; color: string }> = {
    loading: { label: 'Carregando...', color: 'bg-[#2d2f33] text-gray-400' },
    open: { label: 'Conectado', color: 'bg-green-900/20 text-green-400' },
    connecting: { label: 'Aguardando QR', color: 'bg-amber-900/20 text-amber-400' },
    close: { label: 'Desconectado', color: 'bg-red-900/20 text-red-400' },
    error: { label: 'Erro', color: 'bg-red-900/20 text-red-400' },
    unknown: { label: 'Desconhecido', color: 'bg-[#2d2f33] text-gray-400' },
  }

  const { label, color } = config[state] || config.unknown

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}
