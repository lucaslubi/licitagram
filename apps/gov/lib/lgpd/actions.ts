'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

export async function deleteMyDataAction(): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.rpc('lgpd_delete_user_data')
  if (error) {
    logger.error({ err: error.message }, 'lgpd_delete_user_data failed')
    return { ok: false, error: error.message }
  }
  // Força logout server-side após anonimização
  await supabase.auth.signOut()
  redirect('/login?msg=data-deleted')
}
