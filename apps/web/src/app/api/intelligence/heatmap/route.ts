import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ heatmap: [] })

    const { data: profile } = await supabase.from('users').select('company_id').eq('id', user.id).single()
    if (!profile?.company_id) return NextResponse.json({ heatmap: [] })

    const { data: matches } = await supabase
      .from('matches')
      .select('tender_id')
      .eq('company_id', profile.company_id)
      .limit(500)

    if (!matches || matches.length === 0) return NextResponse.json({ heatmap: [] })
    const tenderIds = [...new Set(matches.map(m => m.tender_id))]

    // Get alerts with tender UF
    const { data: alerts } = await supabase
      .from('fraud_alerts')
      .select('severity, tenders!inner(uf)')
      .in('tender_id', tenderIds.slice(0, 100))
      .eq('resolved', false)

    // Aggregate by UF
    const ufMap: Record<string, { total: number; critical: number }> = {}
    for (const a of (alerts || [])) {
      const uf = (a.tenders as any)?.uf || 'N/I'
      if (!ufMap[uf]) ufMap[uf] = { total: 0, critical: 0 }
      ufMap[uf].total++
      if (a.severity === 'CRITICAL') ufMap[uf].critical++
    }

    const heatmap = Object.entries(ufMap)
      .map(([uf, data]) => ({ uf, ...data }))
      .sort((a, b) => b.total - a.total)

    return NextResponse.json({ heatmap })
  } catch {
    return NextResponse.json({ heatmap: [] })
  }
}
