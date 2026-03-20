import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { KanbanBoard } from './kanban-board'
import { PendingOutcomesBanner } from './pending-outcomes-banner'

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
      .not('tenders.modalidade_id', 'in', '(9,14)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
      .order('score', { ascending: false }),

    // Matches with closed tenders that have no bid_outcome yet (interested/applied only)
    supabase
      .from('matches')
      .select(
        'id, score, status, tenders!inner(objeto, orgao_nome, uf, data_encerramento, modalidade_id)',
      )
      .eq('company_id', profile.company_id)
      .in('status', ['interested', 'applied'])
      .not('tenders.modalidade_id', 'in', '(9,14)')
      .lt('tenders.data_encerramento', today)
      .order('tenders(data_encerramento)', { ascending: true })
      .limit(5),
  ])

  const matches = matchesResult.data

  // Filter out matches that already have bid_outcomes
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

  // Normalize the matches for the client component
  const normalizedMatches = (matches || []).map((m) => {
    const tender = m.tenders as unknown as Record<string, unknown> | null
    return {
      id: m.id,
      score: m.score,
      status: m.status,
      isHot: (m as unknown as Record<string, unknown>).is_hot === true,
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

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-2">
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <p className="text-sm text-gray-400">Arraste os cards entre as colunas para atualizar o status</p>
      </div>

      {pendingOutcomes.length > 0 && (
        <PendingOutcomesBanner pendingOutcomes={pendingOutcomes} />
      )}

      <KanbanBoard initialMatches={normalizedMatches} />
    </div>
  )
}
