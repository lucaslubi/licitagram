'use client'

import { useState } from 'react'
import { getScoreBgClass } from '@/lib/score-colors'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { createClient } from '@/lib/supabase/client'

interface Match {
  id: string
  score: number
  status: string
  isHot: boolean
  competitionScore: number | null
  tenders: {
    objeto: string
    orgao_nome: string
    uf: string
    valor_estimado: number | null
    data_abertura: string | null
    data_encerramento: string | null
  } | null
}

const COLUMNS = [
  { key: 'new', label: 'Nova', accent: 'border-t-gray-500' },
  { key: 'interested', label: 'Interesse', accent: 'border-t-brand' },
  { key: 'applied', label: 'Participando', accent: 'border-t-blue-500' },
  { key: 'won', label: 'Venceu', accent: 'border-t-emerald-500' },
  { key: 'lost', label: 'Perdeu', accent: 'border-t-red-500' },
]

function formatCurrencyShort(val: number): string {
  if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `R$ ${(val / 1_000).toFixed(0)}K`
  return `R$ ${val.toFixed(0)}`
}

function timeUntil(dateStr: string): { text: string; urgency: 'normal' | 'warning' | 'critical' } {
  const target = new Date(dateStr)
  const now = new Date()
  const hours = Math.max(0, (target.getTime() - now.getTime()) / (1000 * 60 * 60))
  if (hours < 1) return { text: 'Encerra em menos de 1h', urgency: 'critical' }
  if (hours < 24) return { text: `Encerra em ${Math.floor(hours)}h`, urgency: 'critical' }
  if (hours < 48) return { text: `Encerra em ${Math.floor(hours)}h`, urgency: 'warning' }
  const days = Math.floor(hours / 24)
  return { text: `Encerra em ${days} dia${days > 1 ? 's' : ''}`, urgency: 'normal' }
}

function DroppableColumn({
  columnKey,
  label,
  accent,
  matches,
  activeId,
}: {
  columnKey: string
  label: string
  accent: string
  matches: Match[]
  activeId: string | null
}) {
  const { isOver, setNodeRef } = useDroppable({ id: columnKey })

  return (
    <div className="min-w-[220px] sm:min-w-[260px] flex-1 flex flex-col">
      {/* Column header */}
      <div className={`rounded-t-lg border-t-2 ${accent} bg-[#23262a] border-x border-b border-[#2d2f33]`}>
        <div className="flex items-center justify-between px-3 py-2.5">
          <h3 className="font-semibold text-sm text-white">{label}</h3>
          <span className="text-xs text-gray-400 tabular-nums">{matches.length}</span>
        </div>
      </div>

      {/* Cards area */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[200px] space-y-2 p-2 rounded-b-lg border-x border-b border-[#2d2f33] transition-colors ${
          isOver ? 'bg-brand/5 ring-1 ring-brand/20' : 'bg-[#1a1c1f]/50'
        }`}
      >
        {matches.map((match) => (
          <DraggableCard key={match.id} match={match} isDragging={activeId === match.id} />
        ))}
        {matches.length === 0 && (
          <div className="text-center py-8 text-xs text-gray-400">
            Arraste cards para cá
          </div>
        )}
      </div>
    </div>
  )
}

function DraggableCard({ match, isDragging }: { match: Match; isDragging: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: match.id,
    data: { status: match.status },
  })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  const tender = match.tenders
  const isHot = match.isHot
  const scoreColor = getScoreBgClass(match.score)

  const countdown = tender?.data_encerramento ? timeUntil(tender.data_encerramento) : null
  const countdownColor = countdown?.urgency === 'critical'
    ? 'text-red-400'
    : countdown?.urgency === 'warning'
      ? 'text-amber-400'
      : 'text-gray-400'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`bg-[#23262a] rounded-lg border border-[#2d2f33] p-3 cursor-grab active:cursor-grabbing hover:border-gray-500/40 transition-all ${
        isDragging ? 'opacity-40 scale-95' : ''
      } ${isHot ? 'ring-1 ring-orange-500/30' : ''}`}
    >
      {/* Title + Score */}
      <div className="flex items-start gap-2 mb-1.5">
        <a
          href={`/opportunities/${match.id}`}
          className="text-[13px] leading-snug font-medium text-gray-200 line-clamp-2 hover:text-white flex-1 min-w-0 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {truncateText(tender?.objeto || 'N/A', 70)}
        </a>
        <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold ${scoreColor}`}>
          {isHot ? '🔥 ' : ''}{match.score}
        </span>
      </div>

      {/* Org name */}
      <p className="text-[11px] text-gray-400 truncate mb-2">{tender?.orgao_nome || ''}</p>

      {/* UF + Value */}
      <div className="flex justify-between items-center">
        <span className="text-[11px] text-gray-400 uppercase tracking-wide">{tender?.uf || ''}</span>
        <span className={`text-sm font-semibold tabular-nums ${tender?.valor_estimado ? 'text-white' : 'text-gray-500'}`}>
          {tender?.valor_estimado
            ? formatCurrencyShort(tender.valor_estimado)
            : '—'}
        </span>
      </div>

      {/* Countdown (hot items only) */}
      {countdown && isHot && (
        <div className={`mt-2 flex items-center gap-1 text-[10px] ${countdownColor}`}>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          {countdown.text}
        </div>
      )}

      {/* Atestado button (won items only) */}
      {match.status === 'won' && (
        <div className="mt-2">
          <a
            href={`/opportunities/${match.id}#atestado`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 font-medium"
          >
            📄 Solicitar Atestado Técnico
          </a>
        </div>
      )}

      {/* Competition badge (hot items only) */}
      {match.isHot && match.competitionScore != null && (
        <div className="mt-1.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            match.competitionScore >= 75 ? 'bg-emerald-500/10 text-emerald-400' :
            match.competitionScore >= 50 ? 'bg-amber-500/10 text-amber-400' :
            'bg-red-500/10 text-red-400'
          }`}>
            {match.competitionScore >= 75 ? 'Baixa competição' :
             match.competitionScore >= 50 ? 'Moderada' :
             'Disputado'} ({match.competitionScore})
          </span>
        </div>
      )}
    </div>
  )
}

function CardOverlay({ match }: { match: Match }) {
  const tender = match.tenders
  const isHot = match.isHot
  const scoreColor = getScoreBgClass(match.score)

  return (
    <div className="bg-[#23262a] rounded-lg border-2 border-brand/50 p-3 shadow-2xl shadow-black/40 w-[240px] rotate-2">
      <div className="flex items-start gap-2 mb-1.5">
        <p className="text-[13px] font-medium text-gray-200 line-clamp-2 flex-1">
          {truncateText(tender?.objeto || 'N/A', 70)}
        </p>
        <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold ${scoreColor}`}>
          {isHot ? '🔥 ' : ''}{match.score}
        </span>
      </div>
      <p className="text-[11px] text-gray-400 truncate">{tender?.orgao_nome || ''}</p>
    </div>
  )
}

function truncateText(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 3) + '...' : text
}

export function KanbanBoard({ initialMatches }: { initialMatches: Match[] }) {
  const [matches, setMatches] = useState(initialMatches)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const supabase = createClient()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  const grouped: Record<string, Match[]> = {}
  for (const col of COLUMNS) {
    grouped[col.key] = matches
      .filter((m) => m.status === col.key)
      .sort((a, b) => {
        if (a.isHot && !b.isHot) return -1
        if (!a.isHot && b.isHot) return 1
        return b.score - a.score
      })
  }

  const activeMatch = activeId ? matches.find((m) => m.id === activeId) : null

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)

    const { active, over } = event
    if (!over) return

    const matchId = active.id as string
    const newStatus = over.id as string

    if (!COLUMNS.find((c) => c.key === newStatus)) return

    const match = matches.find((m) => m.id === matchId)
    if (!match || match.status === newStatus) return

    // Optimistic update
    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, status: newStatus } : m)),
    )

    // Persist
    const { error } = await supabase
      .from('matches')
      .update({ status: newStatus })
      .eq('id', matchId)

    if (error) {
      setMatches((prev) =>
        prev.map((m) => (m.id === matchId ? { ...m, status: match.status } : m)),
      )
      setErrorMsg('Erro ao mover card. Tente novamente.')
      setTimeout(() => setErrorMsg(''), 4000)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {errorMsg && (
        <div className="mb-3 px-4 py-2 bg-red-900/20 border border-red-900/30 text-red-400 text-sm rounded-md">
          {errorMsg}
        </div>
      )}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <DroppableColumn
            key={col.key}
            columnKey={col.key}
            label={col.label}
            accent={col.accent}
            matches={grouped[col.key] || []}
            activeId={activeId}
          />
        ))}
      </div>

      <DragOverlay>
        {activeMatch ? <CardOverlay match={activeMatch} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
