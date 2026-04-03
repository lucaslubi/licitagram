'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

interface CalendarEvent {
  id: string
  date: string
  type: 'abertura' | 'encerramento' | 'certidao' | 'impugnacao' | 'proposta'
  title: string
  description: string
  link: string
  urgency: 'normal' | 'soon' | 'urgent'
}

const TYPE_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  abertura: { label: 'Abertura', color: 'bg-emerald-900/20 text-emerald-400 border-emerald-900/30', dot: 'bg-emerald-500' },
  encerramento: { label: 'Encerramento', color: 'bg-amber-900/20 text-amber-400 border-amber-900/30', dot: 'bg-amber-500' },
  certidao: { label: 'Certidão', color: 'bg-red-900/20 text-red-400 border-red-900/30', dot: 'bg-red-500' },
  impugnacao: { label: 'Impugnação', color: 'bg-orange-900/20 text-orange-400 border-orange-900/30', dot: 'bg-orange-500' },
  proposta: { label: 'Proposta', color: 'bg-blue-900/20 text-blue-400 border-blue-900/30', dot: 'bg-blue-500' },
}

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function toDateOnly(dateStr: string): string {
  // Handle both "2026-04-05" and "2026-04-05T14:00:00+00:00"
  return (dateStr || '').substring(0, 10)
}

function formatDate(dateStr: string): string {
  const parts = toDateOnly(dateStr).split('-')
  if (parts.length < 3) return dateStr
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`
}

function daysUntil(dateStr: string): string {
  const clean = toDateOnly(dateStr)
  if (!clean || clean.length < 10) return ''
  const [y, m, d] = clean.split('-').map(Number)
  const target = new Date(y, m - 1, d, 23, 59, 59)
  const diff = Math.ceil((target.getTime() - Date.now()) / 86400000)
  if (diff < 0) return `${Math.abs(diff)}d atrás`
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  return `em ${diff}d`
}

export function CalendarView({ events }: { events: CalendarEvent[] }) {
  const [view, setView] = useState<'list' | 'month'>('list')
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())

  const filteredEvents = useMemo(() => {
    if (typeFilter.size === 0) return events
    return events.filter(e => typeFilter.has(e.type))
  }, [events, typeFilter])

  const sortedEvents = useMemo(() =>
    [...filteredEvents].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [filteredEvents]
  )

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of filteredEvents) {
      const key = toDateOnly(e.date)
      const list = map.get(key) || []
      list.push(e)
      map.set(key, list)
    }
    return map
  }, [filteredEvents])

  // Group events for list view
  const grouped = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

    const groups: { label: string; events: CalendarEvent[] }[] = [
      { label: 'Hoje', events: [] },
      { label: 'Amanhã', events: [] },
      { label: 'Esta semana', events: [] },
      { label: 'Próximas semanas', events: [] },
      { label: 'Passado', events: [] },
    ]

    for (const e of sortedEvents) {
      const d = toDateOnly(e.date)
      if (d === today) groups[0].events.push(e)
      else if (d === tomorrow) groups[1].events.push(e)
      else if (d > today && d <= weekEnd) groups[2].events.push(e)
      else if (d > weekEnd) groups[3].events.push(e)
      else groups[4].events.push(e)
    }

    return groups.filter(g => g.events.length > 0)
  }, [sortedEvents])

  // Calendar grid
  const calendarDays = useMemo(() => {
    const { year, month } = currentMonth
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const days: (number | null)[] = []

    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let i = 1; i <= daysInMonth; i++) days.push(i)

    return days
  }, [currentMonth])

  function toggleFilter(type: string) {
    setTypeFilter(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button onClick={() => setView('list')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${view === 'list' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30' : 'bg-[#2d2f33] text-gray-400'}`}>Lista</button>
          <button onClick={() => setView('month')} className={`px-3 py-1.5 rounded-lg text-xs font-medium hidden md:block ${view === 'month' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30' : 'bg-[#2d2f33] text-gray-400'}`}>Mês</button>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
            <button
              key={type}
              onClick={() => toggleFilter(type)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                typeFilter.size === 0 || typeFilter.has(type) ? cfg.color : 'bg-[#2d2f33] text-gray-500 opacity-50'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {/* List view */}
      {view === 'list' && (
        <div className="space-y-6">
          {grouped.length === 0 ? (
            <div className="bg-[#1a1c1f] border border-[#2d2f33] rounded-xl p-8 text-center">
              <p className="text-gray-500">Nenhum evento no calendário</p>
            </div>
          ) : grouped.map(group => (
            <div key={group.label}>
              <h3 className="text-white text-sm font-semibold mb-2">{group.label}</h3>
              <div className="space-y-2">
                {group.events.map(e => {
                  const cfg = TYPE_CONFIG[e.type] || TYPE_CONFIG.abertura
                  return (
                    <Link
                      key={e.id}
                      href={e.link}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-[#2d2f33]/30 ${
                        e.urgency === 'urgent' ? 'bg-red-900/5 border-red-900/20' :
                        e.urgency === 'soon' ? 'bg-amber-900/5 border-amber-900/20' :
                        'bg-[#1a1c1f] border-[#2d2f33]'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{e.title}</p>
                        <p className="text-[10px] text-gray-400 truncate">{e.description}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-mono text-gray-300">{formatDate(e.date)}</p>
                        <p className={`text-[10px] ${e.urgency === 'urgent' ? 'text-red-400 font-semibold' : e.urgency === 'soon' ? 'text-amber-400' : 'text-gray-500'}`}>
                          {daysUntil(e.date)}
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Month view (desktop only) */}
      {view === 'month' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCurrentMonth(p => p.month === 0 ? { year: p.year - 1, month: 11 } : { ...p, month: p.month - 1 })} className="p-2 rounded-lg hover:bg-[#2d2f33] text-gray-400">←</button>
            <h3 className="text-white font-semibold">{MONTHS[currentMonth.month]} {currentMonth.year}</h3>
            <button onClick={() => setCurrentMonth(p => p.month === 11 ? { year: p.year + 1, month: 0 } : { ...p, month: p.month + 1 })} className="p-2 rounded-lg hover:bg-[#2d2f33] text-gray-400">→</button>
          </div>

          <div className="grid grid-cols-7 gap-px bg-[#2d2f33] rounded-xl overflow-hidden">
            {DAYS.map(d => (
              <div key={d} className="bg-[#111214] p-2 text-center text-[10px] text-gray-500 font-medium">{d}</div>
            ))}
            {calendarDays.map((day, i) => {
              if (day === null) return <div key={`empty-${i}`} className="bg-[#111214] p-2 min-h-[80px]" />

              const dateStr = `${currentMonth.year}-${(currentMonth.month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
              const dayEvents = eventsByDate.get(dateStr) || []
              const isToday = dateStr === today
              const isSelected = dateStr === selectedDay

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDay(dateStr === selectedDay ? null : dateStr)}
                  className={`bg-[#111214] p-1.5 min-h-[80px] cursor-pointer hover:bg-[#1a1c1f] transition-colors ${isSelected ? 'ring-1 ring-emerald-500' : ''}`}
                >
                  <span className={`text-xs ${isToday ? 'bg-emerald-500 text-white w-6 h-6 rounded-full flex items-center justify-center font-bold' : 'text-gray-400'}`}>
                    {day}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 3).map(e => (
                      <div key={e.id} className={`w-full h-1.5 rounded-full ${TYPE_CONFIG[e.type]?.dot || 'bg-gray-500'}`} title={e.title} />
                    ))}
                    {dayEvents.length > 3 && <span className="text-[8px] text-gray-500">+{dayEvents.length - 3}</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Selected day detail */}
          {selectedDay && (eventsByDate.get(selectedDay) || []).length > 0 && (
            <div className="mt-4 bg-[#1a1c1f] border border-[#2d2f33] rounded-xl p-4">
              <h4 className="text-white text-sm font-semibold mb-3">{formatDate(selectedDay)}</h4>
              <div className="space-y-2">
                {(eventsByDate.get(selectedDay) || []).map(e => (
                  <Link key={e.id} href={e.link} className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#2d2f33]/50">
                    <span className={`w-2 h-2 rounded-full ${TYPE_CONFIG[e.type]?.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white truncate">{e.title}</p>
                      <p className="text-[10px] text-gray-400">{e.description}</p>
                    </div>
                    <Badge variant="outline" className={`text-[9px] ${TYPE_CONFIG[e.type]?.color}`}>{TYPE_CONFIG[e.type]?.label}</Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="text-xs text-gray-500 text-center">
        {events.length} evento{events.length !== 1 ? 's' : ''} no calendário
      </div>
    </div>
  )
}
