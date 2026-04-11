import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BotWarRoom } from './bot-war-room'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'

export default async function BotPage() {
  const planUser = await getUserWithPlan()
  if (!planUser) redirect('/login')
  if (!hasFeature(planUser, 'bidding_bot')) {
    redirect('/billing?upgrade=true')
  }

  const supabase = await createClient()
  const user = { id: planUser.userId }

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) redirect('/company')

  // Get bot configs
  const { data: configs } = await supabase
    .from('bot_configs')
    .select('*')
    .eq('company_id', profile.company_id)

  // Get recent sessions with their actions
  const { data: sessions } = await supabase
    .from('bot_sessions')
    .select('*, bot_actions(id, action_type, details, created_at)')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: false })
    .limit(20)

  // Get user's active matches with tender details (for pregao selection)
  const { data: matches } = await supabase
    .from('matches')
    .select(`
      id,
      score,
      status,
      tender_id,
      tenders (
        id,
        pncp_id,
        objeto,
        orgao_nome,
        valor_estimado,
        data_abertura,
        data_encerramento,
        modalidade_nome,
        situacao_nome,
        uf,
        municipio,
        link_pncp
      )
    `)
    .eq('company_id', profile.company_id)
    .in('status', ['new', 'notified', 'viewed', 'interested', 'applied'])
    .order('score', { ascending: false })
    .limit(50)

  // Get competitors for the user's matched tenders
  const tenderIds = (matches || [])
    .map((m: any) => m.tender_id)
    .filter(Boolean)

  let competitors: any[] = []
  if (tenderIds.length > 0) {
    const { data: comps } = await supabase
      .from('competitors')
      .select('*')
      .in('tender_id', tenderIds)
      .order('valor_proposta', { ascending: true })

    competitors = comps || []
  }

  // Flatten tenders from matches for easier consumption
  const tenders = (matches || [])
    .filter((m: any) => m.tenders)
    .map((m: any) => ({
      ...m.tenders,
      match_id: m.id,
      match_score: m.score,
      match_status: m.status,
    }))

  return (
    <BotWarRoom
      configs={configs || []}
      sessions={sessions || []}
      companyId={profile.company_id}
      tenders={tenders}
      competitors={competitors}
    />
  )
}
