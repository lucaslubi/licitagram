'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  link: string | null
  read: boolean
  created_at: string
}

const TYPE_ICONS: Record<string, string> = {
  new_match: '📋',
  hot_match: '🔥',
  urgency: '⏰',
  certidao_expiring: '📄',
  certidao_expired: '❌',
  proposal_generated: '📝',
  outcome_prompt: '🏆',
  bot_session_completed: '🤖',
  impugnation_deadline: '⚖️',
  weekly_report: '📊',
  system: '🔔',
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
  return `há ${days}d`
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Poll unread count every 30s
  useEffect(() => {
    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    return () => clearInterval(interval)
  }, [])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function fetchCount() {
    try {
      const res = await fetch('/api/notifications/count')
      const data = await res.json()
      setUnreadCount(data.unreadCount || 0)
    } catch {}
  }

  async function fetchNotifications() {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications?page=1')
      const data = await res.json()
      setNotifications(data.notifications || [])
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
    setUnreadCount(prev => Math.max(0, prev - 1))
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  function handleToggle() {
    if (!open) fetchNotifications()
    setOpen(!open)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleToggle}
        className="relative p-2 rounded-lg hover:bg-[#2d2f33] transition-colors"
        aria-label="Notificações"
      >
        <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 99 ? '99' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] max-h-[480px] bg-[#1a1c1f] border border-[#2d2f33] rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2d2f33]">
            <h3 className="text-white text-sm font-semibold">Notificações</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-emerald-400 hover:text-emerald-300">
                Marcar todas como lidas
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[380px]">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm">Nenhuma notificação</p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-[#2d2f33]/50 hover:bg-[#2d2f33]/30 cursor-pointer transition-colors ${!n.read ? 'bg-[#1e2025]' : ''}`}
                  onClick={() => {
                    markRead(n.id)
                    if (n.link) window.location.href = n.link
                  }}
                >
                  <div className="flex gap-3">
                    <span className="text-lg shrink-0">{TYPE_ICONS[n.type] || '🔔'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs truncate ${!n.read ? 'text-white font-semibold' : 'text-gray-300'}`}>{n.title}</p>
                        <span className="text-[10px] text-gray-500 shrink-0">{timeAgo(n.created_at)}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
                    </div>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 mt-1.5" />}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[#2d2f33] px-4 py-2">
            <Link href="/notifications" className="text-xs text-gray-400 hover:text-white" onClick={() => setOpen(false)}>
              Ver todas as notificações →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
