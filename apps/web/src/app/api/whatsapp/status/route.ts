import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getUserWithPlan } from '@/lib/auth-helpers'

export async function GET() {
  const userCtx = await getUserWithPlan()
  if (!userCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()

  const { data: user } = await supabase
    .from('users')
    .select('whatsapp_number, whatsapp_verified, whatsapp_verified_at, notification_preferences')
    .eq('id', userCtx.userId)
    .single()

  if (!user) {
    return NextResponse.json({ connected: false })
  }

  const prefs = (user.notification_preferences as Record<string, boolean>) || {}

  return NextResponse.json({
    connected: !!user.whatsapp_verified,
    number: user.whatsapp_number
      ? '****' + user.whatsapp_number.slice(-4)
      : null,
    verifiedAt: user.whatsapp_verified_at,
    notificationsEnabled: prefs.whatsapp !== false,
  })
}
