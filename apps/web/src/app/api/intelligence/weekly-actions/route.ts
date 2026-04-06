import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function getMonday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.getFullYear(), d.getMonth(), diff)
  return monday.toISOString().split('T')[0]
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) return NextResponse.json({ actions: [] })

  const monday = getMonday()
  const now = new Date().toISOString()

  const { data: actions } = await supabase
    .from('weekly_actions')
    .select('*')
    .eq('company_id', profile.company_id)
    .eq('week_of', monday)
    .is('dismissed_at', null)
    .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({ actions: actions || [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) {
    return NextResponse.json({ error: 'no company' }, { status: 403 })
  }

  const { actionId, operation } = await request.json()
  if (!actionId || !operation) {
    return NextResponse.json({ error: 'actionId and operation required' }, { status: 400 })
  }

  const validOps = ['dismiss', 'snooze', 'view']
  if (!validOps.includes(operation)) {
    return NextResponse.json({ error: `invalid operation, must be one of: ${validOps.join(', ')}` }, { status: 400 })
  }

  let updateData: Record<string, string> = {}
  if (operation === 'dismiss') {
    updateData = { dismissed_at: new Date().toISOString() }
  } else if (operation === 'snooze') {
    updateData = { snoozed_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
  } else if (operation === 'view') {
    updateData = { viewed_at: new Date().toISOString() }
  }

  // Scope update to user's company — prevents cross-company modification
  const { error } = await supabase
    .from('weekly_actions')
    .update(updateData)
    .eq('id', actionId)
    .eq('company_id', profile.company_id)

  if (error) {
    return NextResponse.json({ error: 'update failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
