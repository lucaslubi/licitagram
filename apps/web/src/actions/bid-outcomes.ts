'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { invalidateCache } from '@/lib/redis'

export async function reportOutcome(
  matchId: string,
  outcome: 'won' | 'lost' | 'did_not_participate',
  extra?: { valor_proposta?: number; motivo_perda?: string; concorrente_vencedor?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Não autenticado' }

    const { data: dbUser } = await supabase.from('users').select('company_id').eq('id', user.id).single()
    if (!dbUser) return { success: false, error: 'Usuário não encontrado' }

    const { data: match } = await supabase.from('matches').select('tender_id').eq('id', matchId).single()
    if (!match) return { success: false, error: 'Match não encontrado' }

    const { error: upsertErr } = await supabase.from('bid_outcomes').upsert({
      match_id: matchId,
      company_id: dbUser.company_id,
      tender_id: match.tender_id,
      outcome,
      reported_via: 'dashboard',
      reported_at: new Date().toISOString(),
      ...extra,
    }, { onConflict: 'match_id' })

    if (upsertErr) return { success: false, error: `Erro ao salvar: ${upsertErr.message}` }

    // Update match status
    const statusMap: Record<string, string> = { won: 'won', lost: 'lost', did_not_participate: 'dismissed' }
    const { error: updateErr } = await supabase.from('matches').update({ status: statusMap[outcome] }).eq('id', matchId)
    if (updateErr) return { success: false, error: `Erro ao atualizar status: ${updateErr.message}` }

    // Invalidate match caches for this company (non-blocking)
    try {
      await invalidateCache(`cache:matches:${dbUser.company_id}:*`)
    } catch {
      // Cache invalidation failure is non-critical
    }

    revalidatePath('/dashboard')
    revalidatePath('/pipeline')
    revalidatePath('/opportunities')

    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[reportOutcome] Unexpected error:', message)
    return { success: false, error: message }
  }
}
