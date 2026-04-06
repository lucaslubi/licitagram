'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
import { updateMatchStatus } from '@/actions/update-match-status'

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
  { key: 'new', label: 'Nova', dot: 'bg-zinc-500' },
  { key: 'interested', label: 'Interesse', dot: 'bg-amber-400' },
  { key: 'applied', label: 'Participando', dot: 'bg-blue-400' },
  { key: 'won', label: 'Venceu', dot: 'bg-emerald-400' },
  { key: 'lost', label: 'Perdeu', dot: 'bg-red-400' },
]

const INITIAL_DISPLAY = 20

function formatValue(val: number): string {
  if (val >= 1_000_000_000) return `R$${(val / 1_000_000_000).toFixed(1)}B`
  if (val >= 1_000_000) return `R$${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `R$${(val / 1_000).toFixed(0)}K`
  return `R$${val.toFixed(0)}`
}

function countdownDays(dateStr: string | null): { days: number; urgent: boolean } | null {
  if (!dateStr) return null
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (diff < 0) return null
  return { days: diff, urgent: diff <= 3 }
}

function scoreBadgeClass(score: number): string {
  if (score >= 90) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  if (score >= 80) return 'bg-lime-500/10 text-lime-400 border-lime-500/20'
  if (score >= 70) return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
  return 'bg-foreground/5 text-muted-foreground border-border'
}

function truncateText(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 3) + '...' : text
}

// ─── Column ───────────────────────────────────────────────────────────────────

function DroppableColumn({
  columnKey,
  label,
  dot,
  allMatches,
  activeId,
}: {
  columnKey: string
  label: string
  dot: string
  allMatches: Match[]
  activeId: string | null
}) {
  const { isOver, setNodeRef } = useDroppable({ id: columnKey })
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY)

  const visibleMatches = useMemo(() => allMatches.slice(0, displayCount), [allMatches, displayCount])
  const hasMore = allMatches.length > displayCount
  const remaining = allMatches.length - displayCount

  const totalValue = useMemo(() => allMatches.reduce((s, m) => s + (m.tenders?.valor_estimado || 0), 0), [allMatches])

  return (
    <div className="min-w-[240px] sm:min-w-[260px] flex-1 flex flex-col bg-card border border-border rounded-xl max-h-[calc(100vh-280px)]">
      {/* Header — neutral, no colored top border */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
          <h3 className="font-semibold text-[13px] text-foreground">{label}</h3>
          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-mono tabular-nums">
            {allMatches.length}
          </span>
        </div>
      </div>

      {/* Summary — total value */}
      {allMatches.length > 0 && (
        <div className="px-3 py-2 border-b border-border flex-shrink-0">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1.5">Total</span>
          <span className="text-[12px] font-semibold text-foreground font-mono tabular-nums">{formatValue(totalValue)}</span>
        </div>
      )}

      {/* Cards — scrollable body */}
      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto p-2 space-y-1.5 pipeline-scroll ${
          isOver ? 'bg-primary/5 ring-1 ring-primary/20 ring-inset' : ''
        }`}
      >
        {visibleMatches.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-xs text-muted-foreground">Nenhuma oportunidade</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Arraste cards para cá</p>
          </div>
        ) : (
          visibleMatches.map((match) => (
            <DraggableCard key={match.id} match={match} isDragging={activeId === match.id} />
          ))
        )}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="px-2 py-2 border-t border-border flex-shrink-0">
          <button
            onClick={() => setDisplayCount((c) => c + 20)}
            className="w-full py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-foreground/20 rounded-md transition-colors"
          >
            Carregar mais {Math.min(remaining, 20)} de {remaining}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function DraggableCard({ match, isDragging }: { match: Match; isDragging: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: match.id,
    data: { status: match.status },
  })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  const tender = match.tenders
  const cd = countdownDays(tender?.data_encerramento || null)

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`bg-secondary/50 rounded-lg border border-border p-2.5 cursor-grab active:cursor-grabbing hover:bg-secondary hover:border-foreground/10 transition-all ${
        isDragging ? 'opacity-40 scale-95' : ''
      }`}
    >
      {/* Row 1: Title + Score */}
      <div className="flex items-start gap-2 mb-1">
        <a
          href={`/opportunities/${match.id}`}
          className="text-[12px] leading-snug font-medium text-foreground line-clamp-2 hover:text-primary flex-1 min-w-0 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {truncateText(tender?.objeto || 'N/A', 64)}
        </a>
        <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border font-mono tabular-nums ${scoreBadgeClass(match.score)}`}>
          {match.score}
        </span>
      </div>

      {/* Row 2: Org */}
      <p className="text-[11px] text-muted-foreground truncate mb-1.5">{tender?.orgao_nome || ''}</p>

      {/* Row 3: UF + Countdown + Value */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{tender?.uf || ''}</span>
          {cd && cd.urgent && (
            <span className="text-[10px] font-medium text-red-400">{cd.days}d</span>
          )}
        </div>
        <span className="text-[12px] font-semibold text-foreground font-mono tabular-nums">
          {tender?.valor_estimado ? formatValue(tender.valor_estimado) : '-'}
        </span>
      </div>

      {/* Atestado link (won only) */}
      {match.status === 'won' && (
        <div className="mt-1.5 pt-1.5 border-t border-border">
          <a
            href={`/opportunities/${match.id}#atestado`}
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] text-muted-foreground hover:text-foreground font-medium transition-colors"
          >
            Solicitar Atestado Técnico &rarr;
          </a>
        </div>
      )}
    </div>
  )
}

// ─── Drag Overlay ─────────────────────────────────────────────────────────────

function CardOverlay({ match }: { match: Match }) {
  const tender = match.tenders
  return (
    <div className="bg-card rounded-lg border-2 border-primary/40 p-2.5 shadow-2xl shadow-black/40 w-[240px] rotate-2">
      <div className="flex items-start gap-2 mb-1">
        <p className="text-[12px] font-medium text-foreground line-clamp-2 flex-1">
          {truncateText(tender?.objeto || 'N/A', 64)}
        </p>
        <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border font-mono tabular-nums ${scoreBadgeClass(match.score)}`}>
          {match.score}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground truncate">{tender?.orgao_nome || ''}</p>
    </div>
  )
}

// ─── Board ────────────────────────────────────────────────────────────────────

export function KanbanBoard({ initialMatches }: { initialMatches: Match[] }) {
  const [matches, setMatches] = useState(initialMatches)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()
  const [, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  const grouped = useMemo(() => {
    const g: Record<string, Match[]> = {}
    for (const col of COLUMNS) {
      g[col.key] = matches
        .filter((m) => m.status === col.key)
        .sort((a, b) => b.score - a.score)
    }
    return g
  }, [matches])

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

    const oldStatus = match.status

    // Optimistic update — instant visual feedback
    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, status: newStatus } : m)),
    )

    // Server action: updates DB + invalidates cache + revalidates dashboard/pipeline
    const result = await updateMatchStatus(matchId, newStatus)

    if (result.error) {
      // Revert on error
      setMatches((prev) =>
        prev.map((m) => (m.id === matchId ? { ...m, status: oldStatus } : m)),
      )
      setErrorMsg('Erro ao mover card. Tente novamente.')
      setTimeout(() => setErrorMsg(''), 4000)
    } else {
      // Refresh server data so dashboard/pipeline stay in sync
      startTransition(() => {
        router.refresh()
      })
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
        <div className="mb-3 px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
          {errorMsg}
        </div>
      )}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <DroppableColumn
            key={col.key}
            columnKey={col.key}
            label={col.label}
            dot={col.dot}
            allMatches={grouped[col.key] || []}
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
