import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { alertId } = await req.json()
    if (!alertId) return NextResponse.json({ error: 'Missing alertId' }, { status: 400 })

    const { error } = await supabase
      .from('fraud_alerts')
      .update({ resolved: true, resolved_by: user.id, resolved_at: new Date().toISOString() })
      .eq('id', alertId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
