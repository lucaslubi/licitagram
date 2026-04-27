'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * F-Q4 — Captures explicit relevance feedback (👍/👎) from clients on each match.
 * No retraining yet — purely insumo for future calibration + UI confidence boosters
 * ("Você aprovou X matches similares").
 */

export async function voteOnMatch(
  matchId: string,
  vote: 'up' | 'down',
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'not_authenticated' }

  const { data: profile } = await supabase
    .from('users').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return { success: false, error: 'no_company' }

  // Upsert: if user already voted, update the row.
  const { error } = await supabase
    .from('match_feedback')
    .upsert(
      {
        match_id: matchId,
        user_id: user.id,
        company_id: profile.company_id,
        vote,
        reason: reason || null,
      },
      { onConflict: 'match_id,user_id' },
    )

  if (error) return { success: false, error: error.message }

  revalidatePath('/opportunities')
  revalidatePath(`/opportunities/${matchId}`)
  return { success: true }
}

export async function removeVote(
  matchId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'not_authenticated' }

  const { error } = await supabase
    .from('match_feedback')
    .delete()
    .eq('match_id', matchId)
    .eq('user_id', user.id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/opportunities')
  revalidatePath(`/opportunities/${matchId}`)
  return { success: true }
}
