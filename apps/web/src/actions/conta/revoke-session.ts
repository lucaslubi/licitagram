'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type RevokeResult = { success: boolean; error?: string; removed?: number }

/**
 * Revokes a specific session belonging to the current user. Backed by the SQL
 * helper `public.revoke_my_session(uuid)` (SECURITY DEFINER, scoped to auth.uid()).
 */
export async function revokeSession(sessionId: string): Promise<RevokeResult> {
  if (!sessionId || typeof sessionId !== 'string') return { success: false, error: 'invalid_id' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'not_authenticated' }

  const { data, error } = await supabase.rpc('revoke_my_session', { target_id: sessionId })
  if (error) return { success: false, error: error.message }
  revalidatePath('/conta/sessoes')
  return { success: Boolean(data) }
}

/**
 * Revokes all sessions for the current user except the one matching `currentId`.
 * Falls back to `auth.signOut({ scope: 'others' })` if the SQL helper is missing
 * (e.g. migration not yet applied).
 */
export async function revokeOtherSessions(currentId: string | null): Promise<RevokeResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'not_authenticated' }

  if (currentId) {
    const { data, error } = await supabase.rpc('revoke_other_sessions', { current_id: currentId })
    if (!error) {
      revalidatePath('/conta/sessoes')
      return { success: true, removed: Number(data ?? 0) }
    }
  }

  // Fallback path — works without the SQL helper. Revokes all OTHER refresh
  // tokens for the user via the GoTrue admin API. The current session keeps
  // its access-token until expiry, then gets logged out (acceptable).
  const { error: soErr } = await supabase.auth.signOut({ scope: 'others' })
  if (soErr) return { success: false, error: soErr.message }
  revalidatePath('/conta/sessoes')
  return { success: true }
}
