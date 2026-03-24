'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'

type SalesMode = 'implementation' | 'self_service'

export function SalesModeToggle({
  initialMode,
  initialWhatsapp,
  initialMessage
}: {
  initialMode: SalesMode
  initialWhatsapp: string
  initialMessage: string
}) {
  const [mode, setMode] = useState<SalesMode>(initialMode)
  const [whatsapp, setWhatsapp] = useState(initialWhatsapp)
  const [message, setMessage] = useState(initialMessage)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const supabase = createClient()

  const handleSave = () => {
    startTransition(async () => {
      const { error } = await supabase
        .from('site_settings')
        .update({
          sales_mode: mode,
          consultant_whatsapp: whatsapp,
          consultant_message: message,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1)

      if (!error) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    })
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-1">Modo de Vendas</h3>
      <p className="text-sm text-gray-400 mb-6">
        Controla como clientes acessam a plataforma
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <button
          onClick={() => setMode('implementation')}
          className={`p-4 rounded-xl border-2 text-left transition-all ${
            mode === 'implementation'
              ? 'border-[#F43E01] bg-[#F43E01]/10'
              : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🤝</span>
            <span className="font-semibold text-white">Implementação</span>
          </div>
          <p className="text-sm text-gray-400">
            Clientes falam com consultor antes de contratar. Preços e cadastro ocultados.
          </p>
        </button>

        <button
          onClick={() => setMode('self_service')}
          className={`p-4 rounded-xl border-2 text-left transition-all ${
            mode === 'self_service'
              ? 'border-[#F43E01] bg-[#F43E01]/10'
              : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🚀</span>
            <span className="font-semibold text-white">Self-Service</span>
          </div>
          <p className="text-sm text-gray-400">
            Clientes se cadastram e contratam sozinhos. Preços e planos visíveis.
          </p>
        </button>
      </div>

      {mode === 'implementation' && (
        <div className="space-y-4 mb-6 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              WhatsApp do Consultor
            </label>
            <input
              type="text"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+5511999999999"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder:text-zinc-500 focus:border-[#F43E01] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Mensagem Padrão
            </label>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder:text-zinc-500 focus:border-[#F43E01] focus:outline-none"
            />
          </div>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={isPending}
        className="px-6 py-2.5 bg-[#F43E01] text-white rounded-lg font-medium hover:bg-[#D63500] transition-colors disabled:opacity-50"
      >
        {isPending ? 'Salvando...' : saved ? '✓ Salvo!' : 'Salvar Configuração'}
      </button>
    </div>
  )
}
