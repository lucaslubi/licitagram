'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { invalidateCache } from '@/lib/redis'

export async function reportOutcome(
  matchId: string,
  outcome: 'won' | 'lost' | 'did_not_participate',
  extra?: { valor_proposta?: number; motivo_perda?: string; concorrente_vencedor?: string }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: dbUser } = await supabase.from('users').select('company_id').eq('id', user.id).single()
  if (!dbUser) throw new Error('User not found')

  const { data: match } = await supabase.from('matches').select('tender_id').eq('id', matchId).single()
  if (!match) throw new Error('Match not found')

  const { error: upsertErr } = await supabase.from('bid_outcomes').upsert({
    match_id: matchId,
    company_id: dbUser.company_id,
    tender_id: match.tender_id,
    outcome,
    reported_via: 'dashboard',
    reported_at: new Date().toISOString(),
    ...extra,
  }, { onConflict: 'match_id' })

  if (upsertErr) throw new Error(`Failed to save outcome: ${upsertErr.message}`)

  // Update match status
  const statusMap: Record<string, string> = { won: 'won', lost: 'lost', did_not_participate: 'dismissed' }
  const { error: updateErr } = await supabase.from('matches').update({ status: statusMap[outcome] }).eq('id', matchId)
  if (updateErr) throw new Error(`Failed to update match status: ${updateErr.message}`)

  // Invalidate match caches for this company
  await invalidateCache(`cache:matches:${dbUser.company_id}:*`)

  revalidatePath('/dashboard')
  revalidatePath('/pipeline')
  revalidatePath('/opportunities')
}
