import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { PregoesDashboard } from './components/pregoes-dashboard'

export default async function PregoesPage() {
  const user = await getUserWithPlan()
  if (!user) redirect('/login')

  // Plan gating
  if (!hasFeature(user, 'pregao_chat_monitor')) {
    redirect('/billing?upgrade=true&feature=pregao_chat_monitor')
  }

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.userId)
    .single()

  if (!profile?.company_id) redirect('/company')

  // Load monitors
  const { data: monitors } = await supabase
    .from('pregoes_monitorados')
    .select('*')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: false })

  // Load credentials count
  const { count: credCount } = await supabase
    .from('pregao_portais_credenciais')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', profile.company_id)

  // Load last messages per monitor for preview
  const monitorIds = (monitors ?? []).map((m: { id: string }) => m.id)
  let lastMessages: Record<string, { conteudo: string; classificacao_urgencia: string | null; data_hora_portal: string }> = {}

  if (monitorIds.length > 0) {
    // Get the latest message per monitor
    for (const mId of monitorIds) {
      const { data: msgs } = await supabase
        .from('pregao_mensagens')
        .select('conteudo, classificacao_urgencia, data_hora_portal')
        .eq('pregao_id', mId)
        .order('data_hora_portal', { ascending: false })
        .limit(1)

      if (msgs && msgs.length > 0) {
        lastMessages[mId] = msgs[0]
      }
    }
  }

  return (
    <PregoesDashboard
      monitors={monitors ?? []}
      lastMessages={lastMessages}
      credentialsCount={credCount ?? 0}
      planLimit={user.plan?.max_pregao_monitors ?? null}
    />
  )
}
