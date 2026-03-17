'use client'

import { useState } from 'react'
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
import { Badge } from '@/components/ui/badge'

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
  { key: 'new', label: 'Nova', color: 'border-gray-400', bg: 'bg-gray-100' },
  { key: 'interested', label: 'Interesse', color: 'border-brand', bg: 'bg-brand/5' },
  { key: 'applied', label: 'Participando', color: 'border-purple-400', bg: 'bg-purple-50' },
  { key: 'won', label: 'Venceu', color: 'border-emerald-400', bg: 'bg-emerald-50' },
  { key: 'lost', label: 'Perdeu', color: 'border-red-400', bg: 'bg-red-50' },
]

function formatCurrencyShort(val: number): string {
  if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `R$ ${(val / 1_000).toFixed(0)}K`
  return `R$ ${val.toFixed(0)}`
}

function formatCurrencyFull(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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
  color,
  bg,
  matches,
  activeId,
}: {
  columnKey: string
  label: string
  color: string
  bg: string
  matches: Match[]
  activeId: string | null
}) {
  const { isOver, setNodeRef } = useDroppable({ id: columnKey })

  return (
    <div className="min-w-[220px] sm:min-w-[260px] flex-1 flex flex-col">
      <div className={`border-t-4 ${color} rounded-t-md`}>
        <div className="flex items-center justify-between p-3 bg-white rounded-t-md border-x border-b">
          <h3 className="font-semibold text-sm">{label}</h3>
          <Badge variant="secondary" className="text-xs">{matches.length}</Badge>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[200px] space-y-2 mt-1 p-2 rounded-b-md transition-colors ${
          isOver ? 'bg-brand/10 ring-2 ring-brand/30' : bg
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

  const scoreColor = isHot
    ? 'bg-orange-100 text-orange-800'
    : match.score >= 70
      ? 'bg-emerald-100 text-emerald-800'
      : match.score >= 50
        ? 'bg-amber-100 text-amber-800'
        : 'bg-red-100 text-red-800'

  const countdown = tender?.data_encerramento ? timeUntil(tender.data_encerramento) : null
  const countdownColor = countdown?.urgency === 'critical'
    ? 'text-red-600 font-semibold'
    : countdown?.urgency === 'warning'
      ? 'text-amber-600'
      : 'text-gray-400'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`bg-white rounded-lg border p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
        isDragging ? 'opacity-50 shadow-lg' : ''
      } ${isHot ? 'border-l-[3px] border-l-orange-500 bg-orange-50' : ''}`}
    >
      <div className="flex items-start justify-between mb-1.5">
        <a
          href={`/opportunities/${match.id}`}
          className="text-xs font-medium text-gray-900 line-clamp-2 hover:text-brand flex-1 min-w-0"
          onClick={(e) => e.stopPropagation()}
        >
          {truncateText(tender?.objeto || 'N/A', 70)}
        </a>
        <span className={`ml-1 shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${scoreColor}`}>
          {isHot ? '🔥 ' : ''}{match.score}
        </span>
      </div>
      <p className="text-xs text-gray-400 truncate">{tender?.orgao_nome || ''}</p>
      <div className="flex justify-between mt-1.5 text-xs text-gray-400">
        <span>{tender?.uf || ''}</span>
        <span className={isHot ? 'font-bold text-gray-700' : ''}>
          {tender?.valor_estimado
            ? (isHot ? formatCurrencyFull(tender.valor_estimado) : formatCurrencyShort(tender.valor_estimado))
            : '-'}
        </span>
      </div>
      {countdown && isHot && (
        <div className={`mt-1.5 text-[10px] ${countdownColor}`}>
          ⏰ {countdown.text}
        </div>
      )}
      {match.isHot && match.competitionScore != null && (
        <div className="flex items-center gap-1 mt-1">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
            match.competitionScore >= 75 ? 'bg-green-100 text-green-700' :
            match.competitionScore >= 50 ? 'bg-yellow-100 text-yellow-700' :
            'bg-red-100 text-red-700'
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
  const scoreColor = isHot
    ? 'bg-orange-100 text-orange-800'
    : match.score >= 70
      ? 'bg-emerald-100 text-emerald-800'
      : match.score >= 50
        ? 'bg-amber-100 text-amber-800'
        : 'bg-red-100 text-red-800'

  return (
    <div className={`bg-white rounded-lg border-2 p-3 shadow-xl w-[240px] rotate-2 ${isHot ? 'border-orange-500' : 'border-brand'}`}>
      <div className="flex items-start justify-between mb-1.5">
        <p className="text-xs font-medium text-gray-900 line-clamp-2 flex-1">
          {truncateText(tender?.objeto || 'N/A', 70)}
        </p>
        <span className={`ml-1 shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${scoreColor}`}>
          {isHot ? '🔥 ' : ''}{match.score}
        </span>
      </div>
      <p className="text-xs text-gray-400 truncate">{tender?.orgao_nome || ''}</p>
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

    // Check if dropped on a valid column
    if (!COLUMNS.find((c) => c.key === newStatus)) return

    const match = matches.find((m) => m.id === matchId)
    if (!match || match.status === newStatus) return

    // Optimistic update
    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, status: newStatus } : m)),
    )

    // Persist to database
    const { error } = await supabase
      .from('matches')
      .update({ status: newStatus })
      .eq('id', matchId)

    if (error) {
      // Revert on error
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
        <div className="mb-3 px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
          {errorMsg}
        </div>
      )}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <DroppableColumn
            key={col.key}
            columnKey={col.key}
            label={col.label}
            color={col.color}
            bg={col.bg}
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
