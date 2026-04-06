'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { invalidateCache } from '@/lib/redis'

/**
 * Server action to update match status.
 * Called from pipeline kanban drag-drop, status dropdowns, etc.
 * Ensures dashboard + pipeline stay in sync by invalidating all caches.
 */
export async function updateMatchStatus(matchId: string, newStatus: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: dbUser } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (!dbUser?.company_id) return { error: 'No company' }

  const { error } = await supabase
    .from('matches')
    .update({ status: newStatus })
    .eq('id', matchId)

  if (error) return { error: error.message }

  // Invalidate all match-related caches for this company
  await invalidateCache(`cache:matches:${dbUser.company_id}:*`)

  // Revalidate both pages so Next.js serves fresh data immediately
  revalidatePath('/dashboard')
  revalidatePath('/pipeline')
  revalidatePath('/opportunities')

  return { success: true }
}
