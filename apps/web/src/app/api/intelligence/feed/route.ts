import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('users').select('company_id').eq('id', user.id).single()
    if (!profile?.company_id) return NextResponse.json({ alerts: [], total: 0 })

    const url = new URL(req.url)
    const severity = url.searchParams.get('severity') || ''
    const type = url.searchParams.get('type') || ''
    const period = parseInt(url.searchParams.get('period') || '30')
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
    const pageSize = 20

    // Get company tenders
    const { data: matches } = await supabase
      .from('matches')
      .select('tender_id')
      .eq('company_id', profile.company_id)
      .limit(500)

    if (!matches || matches.length === 0) return NextResponse.json({ alerts: [], total: 0 })
    const tenderIds = [...new Set(matches.map(m => m.tender_id))]

    let query = supabase
      .from('fraud_alerts')
      .select('*, tenders!inner(objeto, orgao_nome, uf, valor_estimado)', { count: 'exact' })
      .in('tender_id', tenderIds.slice(0, 100))
      .eq('resolved', false)
      .gte('created_at', new Date(Date.now() - period * 86400000).toISOString())
      .order('created_at', { ascending: false })

    if (severity) query = query.eq('severity', severity)
    if (type) query = query.eq('alert_type', type)

    query = query.range((page - 1) * pageSize, page * pageSize - 1)

    const { data: alerts, count } = await query
    return NextResponse.json({ alerts: alerts || [], total: count || 0, page, pageSize })
  } catch {
    return NextResponse.json({ alerts: [], total: 0 })
  }
}
