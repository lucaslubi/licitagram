import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('users').select('company_id').eq('id', user.id).single()
    if (!profile?.company_id) return NextResponse.json({ critical: 0, high: 0, medium: 0, analyzed: 0 })

    // Get company's tender IDs first
    const { data: matches } = await supabase
      .from('matches')
      .select('tender_id')
      .eq('company_id', profile.company_id)
      .limit(1000)

    if (!matches || matches.length === 0) {
      return NextResponse.json({ critical: 0, high: 0, medium: 0, analyzed: 0 })
    }

    const tenderIds = [...new Set(matches.map(m => m.tender_id))]

    const { data: alerts } = await supabase
      .from('fraud_alerts')
      .select('severity')
      .in('tender_id', tenderIds.slice(0, 100))
      .eq('resolved', false)

    const stats = {
      critical: (alerts || []).filter(a => a.severity === 'CRITICAL').length,
      high: (alerts || []).filter(a => a.severity === 'HIGH').length,
      medium: (alerts || []).filter(a => a.severity === 'MEDIUM').length,
      analyzed: tenderIds.length,
    }

    return NextResponse.json(stats)
  } catch {
    return NextResponse.json({ critical: 0, high: 0, medium: 0, analyzed: 0 })
  }
}
