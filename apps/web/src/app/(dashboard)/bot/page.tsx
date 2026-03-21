import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BotWarRoom } from './bot-war-room'

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

  // Get bot configs
  const { data: configs } = await supabase
    .from('bot_configs')
    .select('*')
    .eq('company_id', profile.company_id)

  // Get recent sessions
  const { data: sessions } = await supabase
    .from('bot_sessions')
    .select('*')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <BotWarRoom
      configs={configs || []}
      sessions={sessions || []}
      companyId={profile.company_id}
    />
  )
}
