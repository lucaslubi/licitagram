import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function getMonday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
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
  const { data: actions } = await supabase
    .from('weekly_actions')
    .select('*')
    .eq('company_id', profile.company_id)
    .eq('week_of', monday)
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({ actions: actions || [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { actionId, operation } = await request.json()
  if (!actionId || !operation) {
    return NextResponse.json({ error: 'actionId and operation required' }, { status: 400 })
  }

  if (operation === 'dismiss') {
    await supabase
      .from('weekly_actions')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', actionId)
  } else if (operation === 'snooze') {
    const snoozeUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('weekly_actions')
      .update({ snoozed_until: snoozeUntil })
      .eq('id', actionId)
  } else if (operation === 'view') {
    await supabase
      .from('weekly_actions')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', actionId)
  }

  return NextResponse.json({ success: true })
}
