'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Message {
  id: string
  remetente: string
  remetente_identificacao: string | null
  conteudo: string
  data_hora_portal: string
  classificacao_tipo: string | null
  classificacao_urgencia: string | null
  requer_acao_licitante: boolean | null
  prazo_detectado_ate: string | null
  resumo_acao: string | null
}

interface Props {
  pregaoId: string
  pregaoInfo: {
    orgaoNome: string
    numeroPregao: string
    faseAtual: string
  }
  onClose: () => void
}

// ─── Urgency Colors ─────────────────────────────────────────────────────────

const urgencyBg: Record<string, string> = {
  critica: 'bg-red-50 border-l-4 border-l-red-500',
  alta: 'bg-orange-50 border-l-4 border-l-orange-500',
  normal: 'bg-gray-50 border-l-4 border-l-gray-300',
  baixa: 'bg-white border-l-4 border-l-gray-200',
}

const tipoBadgeColors: Record<string, string> = {
  convocacao: 'bg-red-100 text-red-800',
  diligencia: 'bg-orange-100 text-orange-800',
  suspensao: 'bg-gray-200 text-gray-700',
  retomada: 'bg-green-100 text-green-800',
  aceitacao: 'bg-blue-100 text-blue-800',
  desclassificacao: 'bg-red-200 text-red-900',
  habilitacao: 'bg-purple-100 text-purple-800',
  recurso: 'bg-yellow-100 text-yellow-800',
  esclarecimento: 'bg-cyan-100 text-cyan-800',
  geral: 'bg-gray-100 text-gray-600',
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PregaoChatModal({ pregaoId, pregaoInfo, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Fetch initial messages
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/pregao-chat/messages?pregao_id=${pregaoId}&limit=100`)
      if (res.ok) {
        const data = await res.json()
        // Reverse to show oldest first (API returns newest first)
        setMessages((data.messages as Message[]).reverse())
        setTotal(data.total)
      }
    } finally {
      setLoading(false)
    }
  }, [pregaoId])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  // Subscribe to Supabase Realtime for live updates
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`pregao-${pregaoId}`)

    channel
      .on('broadcast', { event: 'new_messages' }, () => {
        // Refetch on new messages
        fetchMessages()
      })
      .on('broadcast', { event: 'message_classified' }, (payload) => {
        // Update classification inline
        const { mensagem_id, urgencia, tipo } = payload.payload as {
          mensagem_id: string
          urgencia: string
          tipo: string
        }
        setMessages(prev =>
          prev.map(m =>
            m.id === mensagem_id
              ? { ...m, classificacao_urgencia: urgencia, classificacao_tipo: tipo }
              : m,
          ),
        )
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [pregaoId, fetchMessages])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function formatTimestamp(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  }

  function relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
  }

  function countdown(prazoStr: string): string | null {
    const prazo = new Date(prazoStr).getTime()
    const now = Date.now()
    const diff = prazo - now
    if (diff <= 0) return 'EXPIRADO'
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    if (hours > 0) return `${hours}h ${minutes}min restantes`
    return `${minutes}min restantes`
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-semibold text-lg">
              {pregaoInfo.orgaoNome} — Pregão {pregaoInfo.numeroPregao}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline">{pregaoInfo.faseAtual}</Badge>
              <span className="text-sm text-muted-foreground">
                {total} mensagens capturadas
              </span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Aguardando mensagens do pregoeiro...
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-lg p-3 ${urgencyBg[msg.classificacao_urgencia ?? 'baixa'] ?? urgencyBg.baixa}`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {msg.remetente_identificacao || msg.remetente}
                    </span>
                    {msg.classificacao_tipo && (
                      <Badge className={`text-xs ${tipoBadgeColors[msg.classificacao_tipo] ?? tipoBadgeColors.geral}`}>
                        {msg.classificacao_tipo}
                      </Badge>
                    )}
                    {msg.classificacao_urgencia && ['critica', 'alta'].includes(msg.classificacao_urgencia) && (
                      <Badge variant="destructive" className="text-xs">
                        {msg.classificacao_urgencia === 'critica' ? '🔴 CRÍTICA' : '🟠 ALTA'}
                      </Badge>
                    )}
                  </div>
                  <span
                    className="text-xs text-muted-foreground cursor-help"
                    title={formatTimestamp(msg.data_hora_portal)}
                  >
                    há {relativeTime(msg.data_hora_portal)}
                  </span>
                </div>

                {/* Content */}
                <p className="text-sm whitespace-pre-wrap">{msg.conteudo}</p>

                {/* Action / Deadline bar */}
                {(msg.resumo_acao || msg.prazo_detectado_ate) && (
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    {msg.resumo_acao && (
                      <span className="text-blue-700 font-medium">
                        ✅ {msg.resumo_acao}
                      </span>
                    )}
                    {msg.prazo_detectado_ate && (
                      <span className={`font-medium ${countdown(msg.prazo_detectado_ate) === 'EXPIRADO' ? 'text-red-600' : 'text-orange-600'}`}>
                        ⏰ {countdown(msg.prazo_detectado_ate)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Footer — read-only notice */}
        <div className="p-3 border-t bg-gray-50 text-center text-sm text-muted-foreground">
          Leitura passiva — responda pelo portal oficial do pregão
        </div>
      </div>
    </div>
  )
}
