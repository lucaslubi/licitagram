'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PregaoChatModal } from './pregao-chat-modal'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Monitor {
  id: string
  portal_slug: string
  portal_pregao_id: string
  portal_pregao_url: string
  orgao_nome: string
  orgao_uasg: string | null
  numero_pregao: string
  objeto_resumido: string | null
  fase_atual: string
  status_monitoramento: string
  ultimo_poll_em: string | null
  erros_consecutivos: number
  ultimo_erro: string | null
  created_at: string
}

interface LastMessage {
  conteudo: string
  classificacao_urgencia: string | null
  data_hora_portal: string
}

interface Props {
  monitors: Monitor[]
  lastMessages: Record<string, LastMessage>
  credentialsCount: number
  planLimit: number | null
}

// ─── Phase + Status Badge Styles (semantic, dark-aware) ────────────────────

const phaseBadgeClass: Record<string, string> = {
  disputa: 'bg-red-500/15 text-red-400 border-red-500/30',
  negociacao: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  aceitacao: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  habilitacao: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  recurso: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  suspenso: 'bg-muted text-muted-foreground border-border',
  homologado: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  encerrado: 'bg-muted text-muted-foreground border-border',
  proposta: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  agendado: 'bg-muted text-muted-foreground border-border',
  desconhecida: 'bg-muted text-muted-foreground border-border',
}

const statusBadgeClass: Record<string, string> = {
  ativo: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  pausado: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  encerrado: 'bg-muted text-muted-foreground border-border',
  erro: 'bg-red-500/15 text-red-400 border-red-500/30',
}

function Pill({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${className}`}>
      {children}
    </span>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PregoesDashboard({ monitors, lastMessages, planLimit }: Props) {
  const [selectedPregaoId, setSelectedPregaoId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const selectedMonitor = monitors.find(m => m.id === selectedPregaoId)
  const activeCount = monitors.filter(m => m.status_monitoramento === 'ativo').length
  const pausedCount = monitors.filter(m => m.status_monitoramento === 'pausado').length
  const errorCount = monitors.filter(m => m.status_monitoramento === 'erro').length
  const totalUrgentes = monitors.reduce((s, m) => s + m.erros_consecutivos, 0)

  async function handleAction(monitorId: string, action: 'pausar' | 'retomar' | 'encerrar') {
    setActionLoading(monitorId)
    try {
      const res = await fetch('/api/pregao-chat/monitors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: monitorId, action }),
      })
      if (res.ok) window.location.reload()
    } finally {
      setActionLoading(null)
    }
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

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Monitor de Pregões</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Chat do pregoeiro em tempo real, classificado por IA
          </p>
        </div>
        <Link href="/pregoes/adicionar">
          <Button size="sm">+ Monitorar pregão</Button>
        </Link>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="bg-card border border-border rounded-xl p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">Ativos</p>
          <p className="text-xl font-semibold text-foreground font-mono tabular-nums tracking-tight">{activeCount}</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {planLimit !== null ? `${activeCount + pausedCount} / ${planLimit} no plano` : 'ilimitado'}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">Pausados</p>
          <p className="text-xl font-semibold text-foreground font-mono tabular-nums tracking-tight">{pausedCount}</p>
          <p className="text-[11px] text-muted-foreground mt-1">aguardando retomada</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">Com erro</p>
          <p className={`text-xl font-semibold font-mono tabular-nums tracking-tight ${errorCount > 0 ? 'text-red-400' : 'text-foreground'}`}>{errorCount}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{totalUrgentes} tentativas totais</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">Total</p>
          <p className="text-xl font-semibold text-foreground font-mono tabular-nums tracking-tight">{monitors.length}</p>
          <p className="text-[11px] text-muted-foreground mt-1">pregões já monitorados</p>
        </div>
      </div>

      {/* Empty State */}
      {monitors.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
            Nenhum pregão monitorado
          </p>
          <p className="text-sm text-foreground max-w-md mx-auto">
            Cole a URL de qualquer pregão do Compras.gov.br e comece a receber alertas
            em tempo real no WhatsApp.
          </p>
          <Link href="/pregoes/adicionar" className="inline-block mt-5">
            <Button size="sm">Monitorar meu primeiro pregão →</Button>
          </Link>
        </div>
      )}

      {/* Monitor Rows */}
      {monitors.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Pregões monitorados
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {monitors.length}
            </p>
          </div>
          <div className="divide-y divide-border">
            {monitors.map((monitor) => {
              const lastMsg = lastMessages[monitor.id]
              return (
                <div key={monitor.id} className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Pill className="bg-muted text-muted-foreground border-border">
                          {monitor.portal_slug === 'comprasgov' ? 'Compras.gov.br' : monitor.portal_slug}
                        </Pill>
                        <Pill className={phaseBadgeClass[monitor.fase_atual] || phaseBadgeClass.desconhecida}>
                          {monitor.fase_atual}
                        </Pill>
                        <Pill className={statusBadgeClass[monitor.status_monitoramento]}>
                          {monitor.status_monitoramento}
                        </Pill>
                      </div>
                      <p className="text-sm font-medium text-foreground truncate">
                        {monitor.orgao_nome} <span className="text-muted-foreground">·</span> Pregão {monitor.numero_pregao}
                      </p>
                      {monitor.objeto_resumido && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {monitor.objeto_resumido}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        {lastMsg ? (
                          <>
                            {lastMsg.classificacao_urgencia === 'critica' && <span className="text-red-400 text-xs">●</span>}
                            {lastMsg.classificacao_urgencia === 'alta' && <span className="text-orange-400 text-xs">●</span>}
                            <p className="text-xs text-muted-foreground truncate flex-1">
                              {lastMsg.conteudo.slice(0, 100)}
                            </p>
                            <p className="text-[11px] text-muted-foreground font-mono tabular-nums shrink-0">
                              {relativeTime(lastMsg.data_hora_portal)}
                            </p>
                          </>
                        ) : (
                          <p className="text-[11px] text-muted-foreground italic">aguardando primeira captura…</p>
                        )}
                      </div>
                      {monitor.ultimo_erro && monitor.status_monitoramento === 'erro' && (
                        <p className="text-[11px] text-red-400 mt-2 font-mono">
                          {monitor.ultimo_erro}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedPregaoId(monitor.id)}
                      >
                        Abrir chat
                      </Button>
                      {monitor.status_monitoramento === 'ativo' && (
                        <Button size="sm" variant="ghost" onClick={() => handleAction(monitor.id, 'pausar')} disabled={actionLoading === monitor.id}>
                          Pausar
                        </Button>
                      )}
                      {monitor.status_monitoramento === 'pausado' && (
                        <Button size="sm" variant="ghost" onClick={() => handleAction(monitor.id, 'retomar')} disabled={actionLoading === monitor.id}>
                          Retomar
                        </Button>
                      )}
                      {['ativo', 'pausado', 'erro'].includes(monitor.status_monitoramento) && (
                        <Button size="sm" variant="ghost" onClick={() => handleAction(monitor.id, 'encerrar')} disabled={actionLoading === monitor.id}>
                          Encerrar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Chat Modal */}
      {selectedPregaoId && selectedMonitor && (
        <PregaoChatModal
          pregaoId={selectedPregaoId}
          pregaoInfo={{
            orgaoNome: selectedMonitor.orgao_nome,
            numeroPregao: selectedMonitor.numero_pregao,
            faseAtual: selectedMonitor.fase_atual,
          }}
          onClose={() => setSelectedPregaoId(null)}
        />
      )}
    </div>
  )
}
