'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  link: string | null
  read: boolean
  created_at: string
}

const TYPE_LABELS: Record<string, string> = {
  new_match: 'Nova Oportunidade',
  hot_match: 'Oportunidade Quente',
  urgency: 'Urgência',
  certidao_expiring: 'Certidão Vencendo',
  certidao_expired: 'Certidão Vencida',
  proposal_generated: 'Proposta Gerada',
  outcome_prompt: 'Resultado',
  bot_session_completed: 'Robô Concluído',
  impugnation_deadline: 'Prazo Impugnação',
  weekly_report: 'Relatório Semanal',
  system: 'Sistema',
}

const TYPE_COLORS: Record<string, string> = {
  new_match: 'bg-emerald-900/20 text-emerald-400 border-emerald-900/30',
  hot_match: 'bg-red-900/20 text-red-400 border-red-900/30',
  urgency: 'bg-amber-900/20 text-amber-400 border-amber-900/30',
  certidao_expiring: 'bg-amber-900/20 text-amber-400 border-amber-900/30',
  certidao_expired: 'bg-red-900/20 text-red-400 border-red-900/30',
  system: 'bg-zinc-800 text-gray-400 border-zinc-700',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `há ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ontem'
  return `há ${days} dias`
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [unreadCount, setUnreadCount] = useState(0)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => { fetchNotifications() }, [page])

  async function fetchNotifications() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (filter === 'unread') params.set('unreadOnly', 'true')
      const res = await fetch(`/api/notifications?${params}`)
      const data = await res.json()
      setNotifications(data.notifications || [])
      setTotalPages(data.totalPages || 1)
      setUnreadCount(data.unreadCount || 0)
    } catch {}
    setLoading(false)
  }

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    })
    setUnreadCount(0)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  async function markRead(id: string) {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    })
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  const filtered = filter === 'all' ? notifications :
    filter === 'unread' ? notifications.filter(n => !n.read) :
    notifications.filter(n => n.type === filter || n.type.startsWith(filter))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Notificações</h1>
          {unreadCount > 0 && <p className="text-gray-400 text-sm">{unreadCount} não lida{unreadCount > 1 ? 's' : ''}</p>}
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            Marcar todas como lidas
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {[
          { id: 'all', label: 'Todas' },
          { id: 'unread', label: 'Não lidas' },
          { id: 'new_match', label: 'Oportunidades' },
          { id: 'certidao', label: 'Certidões' },
          { id: 'outcome', label: 'Resultados' },
          { id: 'system', label: 'Sistema' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => { setFilter(f.id); setPage(1) }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === f.id ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30' : 'bg-[#2d2f33] text-gray-400 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">Nenhuma notificação{filter !== 'all' ? ' neste filtro' : ''}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => (
            <div
              key={n.id}
              onClick={() => { markRead(n.id); if (n.link) window.location.href = n.link }}
              className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                !n.read ? 'bg-[#1e2025] border-[#2d2f33]' : 'bg-[#1a1c1f] border-[#2d2f33]/50'
              } hover:bg-[#2d2f33]/30`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className={`text-[10px] ${TYPE_COLORS[n.type] || TYPE_COLORS.system}`}>
                    {TYPE_LABELS[n.type] || n.type}
                  </Badge>
                  <span className="text-[10px] text-gray-500">{timeAgo(n.created_at)}</span>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
                </div>
                <p className={`text-sm ${!n.read ? 'text-white font-medium' : 'text-gray-300'}`}>{n.title}</p>
                <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
              </div>
              {n.link && (
                <svg className="w-4 h-4 text-gray-500 shrink-0 mt-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
          <span className="text-gray-400 text-sm self-center">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
        </div>
      )}
    </div>
  )
}
