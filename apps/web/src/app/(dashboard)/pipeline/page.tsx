import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { KanbanBoard } from './kanban-board'

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

  const { data: matches } = await supabase
    .from('matches')
    .select(
      'id, score, status, tenders(objeto, orgao_nome, uf, valor_estimado, data_abertura)',
    )
    .eq('company_id', profile.company_id)
    .in('status', COLUMN_KEYS)
    .order('score', { ascending: false })

  // Normalize the matches for the client component
  const normalizedMatches = (matches || []).map((m) => {
    const tender = m.tenders as unknown as Record<string, unknown> | null
    return {
      id: m.id,
      score: m.score,
      status: m.status,
      tenders: tender
        ? {
            objeto: (tender.objeto as string) || '',
            orgao_nome: (tender.orgao_nome as string) || '',
            uf: (tender.uf as string) || '',
            valor_estimado: (tender.valor_estimado as number) || null,
            data_abertura: (tender.data_abertura as string) || null,
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

      <KanbanBoard initialMatches={normalizedMatches} />
    </div>
  )
}
