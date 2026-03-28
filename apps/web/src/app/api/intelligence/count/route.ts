import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ count: 0 })

    const { data: profile } = await supabase.from('users').select('company_id').eq('id', user.id).single()
    if (!profile?.company_id) return NextResponse.json({ count: 0 })

    const { data: matches } = await supabase
      .from('matches')
      .select('tender_id')
      .eq('company_id', profile.company_id)
      .limit(500)

    if (!matches || matches.length === 0) return NextResponse.json({ count: 0 })
    const tenderIds = [...new Set(matches.map(m => m.tender_id))]

    const { count } = await supabase
      .from('fraud_alerts')
      .select('id', { count: 'exact', head: true })
      .in('tender_id', tenderIds.slice(0, 100))
      .eq('resolved', false)

    return NextResponse.json({ count: count || 0 })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
