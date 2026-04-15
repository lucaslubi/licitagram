'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

// ─── Phase Badge Colors ─────────────────────────────────────────────────────

const phaseBadgeVariant: Record<string, string> = {
  disputa: 'bg-red-100 text-red-800',
  negociacao: 'bg-orange-100 text-orange-800',
  aceitacao: 'bg-yellow-100 text-yellow-800',
  habilitacao: 'bg-blue-100 text-blue-800',
  recurso: 'bg-purple-100 text-purple-800',
  suspenso: 'bg-gray-200 text-gray-700',
  homologado: 'bg-green-100 text-green-800',
  encerrado: 'bg-gray-100 text-gray-600',
  proposta: 'bg-cyan-100 text-cyan-800',
  agendado: 'bg-slate-100 text-slate-700',
  desconhecida: 'bg-gray-100 text-gray-500',
}

const statusBadgeVariant: Record<string, string> = {
  ativo: 'bg-green-100 text-green-800',
  pausado: 'bg-yellow-100 text-yellow-800',
  encerrado: 'bg-gray-100 text-gray-600',
  erro: 'bg-red-100 text-red-800',
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PregoesDashboard({ monitors, lastMessages, credentialsCount, planLimit }: Props) {
  const [selectedPregaoId, setSelectedPregaoId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const selectedMonitor = monitors.find(m => m.id === selectedPregaoId)
  const activeCount = monitors.filter(m => ['ativo', 'pausado'].includes(m.status_monitoramento)).length

  async function handleAction(monitorId: string, action: 'pausar' | 'retomar' | 'encerrar') {
    setActionLoading(monitorId)
    try {
      const res = await fetch('/api/pregao-chat/monitors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: monitorId, action }),
      })
      if (res.ok) {
        window.location.reload()
      }
    } finally {
      setActionLoading(null)
    }
  }

  function relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return `${seconds}s atrás`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}min atrás`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h atrás`
    const days = Math.floor(hours / 24)
    return `${days}d atrás`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monitor de Pregões</h1>
          <p className="text-muted-foreground">
            Monitoramento em tempo real do chat do pregoeiro
            {planLimit !== null && (
              <span className="ml-2 text-sm">
                ({activeCount}/{planLimit} monitores ativos)
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {credentialsCount === 0 ? (
            <Link href="/pregoes/conectar">
              <Button>Conectar Portal</Button>
            </Link>
          ) : (
            <>
              <Link href="/pregoes/conectar">
                <Button variant="outline">Gerenciar Credenciais</Button>
              </Link>
              <Link href="/pregoes/adicionar">
                <Button>Adicionar Pregão</Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Empty State */}
      {monitors.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="text-4xl mb-4">📡</div>
            <h3 className="text-lg font-semibold mb-2">Nenhum pregão monitorado</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              {credentialsCount === 0
                ? 'Conecte suas credenciais do portal Compras.gov.br para começar a monitorar pregões em tempo real.'
                : 'Adicione um pregão para começar a receber alertas do chat do pregoeiro.'}
            </p>
            <Link href={credentialsCount === 0 ? '/pregoes/conectar' : '/pregoes/adicionar'}>
              <Button>{credentialsCount === 0 ? 'Conectar Portal' : 'Adicionar Pregão'}</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Monitor Cards */}
      <div className="grid gap-4">
        {monitors.map((monitor) => {
          const lastMsg = lastMessages[monitor.id]

          return (
            <Card key={monitor.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {monitor.portal_slug === 'comprasgov' ? 'Compras.gov.br' : monitor.portal_slug}
                    </Badge>
                    <Badge className={phaseBadgeVariant[monitor.fase_atual] || phaseBadgeVariant.desconhecida}>
                      {monitor.fase_atual}
                    </Badge>
                    <Badge className={statusBadgeVariant[monitor.status_monitoramento]}>
                      {monitor.status_monitoramento}
                    </Badge>
                    {monitor.erros_consecutivos > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {monitor.erros_consecutivos} erros
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {monitor.status_monitoramento === 'ativo' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction(monitor.id, 'pausar')}
                        disabled={actionLoading === monitor.id}
                      >
                        Pausar
                      </Button>
                    )}
                    {monitor.status_monitoramento === 'pausado' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction(monitor.id, 'retomar')}
                        disabled={actionLoading === monitor.id}
                      >
                        Retomar
                      </Button>
                    )}
                    {['ativo', 'pausado', 'erro'].includes(monitor.status_monitoramento) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleAction(monitor.id, 'encerrar')}
                        disabled={actionLoading === monitor.id}
                      >
                        Encerrar
                      </Button>
                    )}
                  </div>
                </div>
                <CardTitle className="text-base">
                  {monitor.orgao_nome} — Pregão {monitor.numero_pregao}
                </CardTitle>
                {monitor.objeto_resumido && (
                  <CardDescription className="line-clamp-1">
                    {monitor.objeto_resumido}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    {lastMsg ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {lastMsg.classificacao_urgencia === 'critica' && <span className="text-red-500">🔴</span>}
                        {lastMsg.classificacao_urgencia === 'alta' && <span className="text-orange-500">🟠</span>}
                        <span className="truncate">{lastMsg.conteudo.slice(0, 100)}</span>
                        <span className="shrink-0 text-xs">
                          {relativeTime(lastMsg.data_hora_portal)}
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Aguardando primeira captura...</p>
                    )}
                  </div>
                  <Button
                    variant="default"
                    size="sm"
                    className="ml-4 shrink-0"
                    onClick={() => setSelectedPregaoId(monitor.id)}
                  >
                    Abrir Chat
                  </Button>
                </div>
                {monitor.ultimo_erro && monitor.status_monitoramento === 'erro' && (
                  <p className="text-xs text-red-500 mt-2">
                    Erro: {monitor.ultimo_erro}
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

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
