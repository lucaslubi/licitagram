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

  // Get bot configs — compute has_cookies flag so the UI can gate session
  // creation on interactive login. Never ship the ciphertext itself to the
  // browser; the Supreme Bot worker reads it server-side.
  const { data: rawConfigs } = await supabase
    .from('bot_configs')
    .select('*')
    .eq('company_id', profile.company_id)

  const configs = (rawConfigs ?? []).map((cfg: Record<string, unknown>) => {
    const hasCookies = !!(cfg.cookies_cipher || cfg.cookies)
    return { ...cfg, has_cookies: hasCookies }
  })

  // Get recent sessions with their actions
  const { data: sessions } = await supabase
    .from('bot_sessions')
    .select('*, bot_actions(id, action_type, details, created_at)')
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
