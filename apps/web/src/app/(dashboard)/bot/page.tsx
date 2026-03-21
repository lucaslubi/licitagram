import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BotDashboard } from './bot-dashboard'

export default async function BotPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) redirect('/company')

  // Get bot configs for this company
  const { data: configs } = await supabase
    .from('bot_configs')
    .select('*')
    .eq('company_id', profile.company_id)

  // Get recent sessions
  const { data: sessions } = await supabase
    .from('bot_sessions')
    .select('*, bot_actions(id, action_type, details, created_at)')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">LICITAGRAM BOT</h1>
        <p className="text-sm text-gray-500 mt-1">
          Robo de lances automaticos para pregoes eletronicos
        </p>
      </div>
      <BotDashboard
        configs={configs || []}
        sessions={sessions || []}
        companyId={profile.company_id}
      />
    </div>
  )
}
