import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { KanbanBoard } from './kanban-board'
import { PendingOutcomesBanner } from './pending-outcomes-banner'
import { formatCompactBRL } from '@/lib/geo/map-utils'

const COLUMN_KEYS = ['new', 'interested', 'applied', 'won', 'lost']

export default async function PipelinePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) redirect('/company')

  const today = new Date().toISOString().split('T')[0]

  const [matchesResult, pendingOutcomesResult] = await Promise.all([
    supabase
      .from('matches')
      .select(
        'id, score, status, is_hot, competition_score, tenders!inner(objeto, orgao_nome, uf, valor_estimado, data_abertura, data_encerramento, modalidade_id)',
      )
      .eq('company_id', profile.company_id)
      .in('status', COLUMN_KEYS)
      .not('tenders.modalidade_nome', 'in', '(Inexigibilidade,Credenciamento)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
      .order('score', { ascending: false }),

    supabase
      .from('matches')
      .select(
        'id, score, status, tenders!inner(objeto, orgao_nome, uf, data_encerramento, modalidade_id)',
      )
      .eq('company_id', profile.company_id)
      .in('status', ['interested', 'applied'])
      .not('tenders.modalidade_nome', 'in', '(Inexigibilidade,Credenciamento)')
      .lt('tenders.data_encerramento', today)
      .order('tenders(data_encerramento)', { ascending: true })
      .limit(5),
  ])

  const matches = matchesResult.data

  // Pending outcomes
  const pendingCandidates = pendingOutcomesResult.data || []
  let pendingOutcomes: Array<{ id: string; objeto: string; orgao_nome: string; uf: string; data_encerramento: string | null }> = []

  if (pendingCandidates.length > 0) {
    const pendingIds = pendingCandidates.map((m) => m.id)
    const { data: existingOutcomes } = await supabase
      .from('bid_outcomes')
      .select('match_id')
      .in('match_id', pendingIds)

    const existingMatchIds = new Set((existingOutcomes || []).map((o) => o.match_id))

    pendingOutcomes = pendingCandidates
      .filter((m) => !existingMatchIds.has(m.id))
      .map((m) => {
        const tender = m.tenders as unknown as Record<string, unknown> | null
        return {
          id: m.id,
          objeto: (tender?.objeto as string) || '',
          orgao_nome: (tender?.orgao_nome as string) || '',
          uf: (tender?.uf as string) || '',
          data_encerramento: (tender?.data_encerramento as string) || null,
        }
      })
  }

  // Normalize matches
  const normalizedMatches = (matches || []).map((m) => {
    const tender = m.tenders as unknown as Record<string, unknown> | null
    return {
      id: m.id,
      score: m.score,
      status: m.status,
      isHot: m.score >= 80,
      competitionScore: (m as unknown as Record<string, unknown>).competition_score as number | null ?? null,
      tenders: tender
        ? {
            objeto: (tender.objeto as string) || '',
            orgao_nome: (tender.orgao_nome as string) || '',
            uf: (tender.uf as string) || '',
            valor_estimado: (tender.valor_estimado as number) || null,
            data_abertura: (tender.data_abertura as string) || null,
            data_encerramento: (tender.data_encerramento as string) || null,
          }
        : null,
    }
  })

  // Compute aggregate metrics
  const totalValue = normalizedMatches.reduce((s, m) => s + (m.tenders?.valor_estimado || 0), 0)
  const participating = normalizedMatches.filter((m) => m.status === 'applied')
  const participatingValue = participating.reduce((s, m) => s + (m.tenders?.valor_estimado || 0), 0)
  const wonCount = normalizedMatches.filter((m) => m.status === 'won').length
  const lostCount = normalizedMatches.filter((m) => m.status === 'lost').length
  const totalDecided = wonCount + lostCount
  const conversionRate = totalDecided > 0 ? Math.round((wonCount / totalDecided) * 100) : 0
  const avgTicket = normalizedMatches.length > 0 ? totalValue / normalizedMatches.length : 0

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-foreground tracking-tight">Pipeline</h1>
        <p className="text-xs text-muted-foreground mt-1">Gestão de oportunidades em andamento</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="bg-card border border-border rounded-xl p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">Valor Total</p>
          <p className="text-xl font-semibold text-foreground font-mono tabular-nums tracking-tight">{formatCompactBRL(totalValue)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{normalizedMatches.length} oportunidades</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">Em Participação</p>
          <p className="text-xl font-semibold text-foreground font-mono tabular-nums tracking-tight">{formatCompactBRL(participatingValue)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{participating.length} oportunidade{participating.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">Taxa de Conversão</p>
          <p className="text-xl font-semibold text-foreground font-mono tabular-nums tracking-tight">{conversionRate}%</p>
          <p className="text-[11px] text-muted-foreground mt-1">{wonCount} ganha{wonCount !== 1 ? 's' : ''} / {totalDecided} decidida{totalDecided !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">Ticket Médio</p>
          <p className="text-xl font-semibold text-foreground font-mono tabular-nums tracking-tight">{formatCompactBRL(avgTicket)}</p>
        </div>
      </div>

      {pendingOutcomes.length > 0 && (
        <PendingOutcomesBanner pendingOutcomes={pendingOutcomes} />
      )}

      <KanbanBoard initialMatches={normalizedMatches} />
    </div>
  )
}
