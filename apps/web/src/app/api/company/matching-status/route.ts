import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) {
      return NextResponse.json({ status: 'no_company', matchCount: 0 })
    }

    const { data: company } = await supabase
      .from('companies')
      .select('matching_status, first_match_at')
      .eq('id', profile.company_id)
      .single()

    const { count } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', profile.company_id)
      .gte('score', 50)

    const matchCount = count || 0
    let status = company?.matching_status || 'pending'

    // Auto-advance: if matches exist but status is stuck in scanning/pending, mark as ready
    if (matchCount > 0 && (status === 'scanning' || status === 'pending')) {
      status = 'ready'
      await supabase
        .from('companies')
        .update({ matching_status: 'ready', first_match_at: company?.first_match_at || new Date().toISOString() })
        .eq('id', profile.company_id)
    }

    return NextResponse.json({
      status,
      matchCount,
      firstMatchAt: company?.first_match_at || null,
    })
  } catch (error) {
    console.error('[GET /api/company/matching-status]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
