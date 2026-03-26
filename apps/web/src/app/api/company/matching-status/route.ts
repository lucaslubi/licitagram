import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
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

  return NextResponse.json({
    status: company?.matching_status || 'pending',
    matchCount: count || 0,
    firstMatchAt: company?.first_match_at || null,
  })
}
