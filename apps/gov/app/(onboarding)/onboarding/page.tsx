import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { OnboardingWizard } from './wizard'

export const metadata: Metadata = { title: 'Configurar conta' }

export default async function OnboardingPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const meta = (user?.user_metadata ?? {}) as { nome_completo?: string; full_name?: string; name?: string }
  const initialNome = meta.nome_completo ?? meta.full_name ?? meta.name ?? ''

  return <OnboardingWizard initialNome={initialNome} email={user?.email ?? ''} />
}
