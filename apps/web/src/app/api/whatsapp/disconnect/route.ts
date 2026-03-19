import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getUserWithPlan } from '@/lib/auth-helpers'

export async function POST() {
  const userCtx = await getUserWithPlan()
  if (!userCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()

  // Clear WhatsApp fields on user
  await supabase
    .from('users')
    .update({
      whatsapp_number: null,
      whatsapp_verified: false,
      whatsapp_verified_at: null,
    })
    .eq('id', userCtx.userId)

  // Disable WhatsApp in notification preferences
  const { data: user } = await supabase
    .from('users')
    .select('notification_preferences')
    .eq('id', userCtx.userId)
    .single()

  if (user) {
    const prefs = (user.notification_preferences as Record<string, boolean>) || {}
    prefs.whatsapp = false
    await supabase
      .from('users')
      .update({ notification_preferences: prefs })
      .eq('id', userCtx.userId)
  }

  // Delete pending verification codes
  await supabase
    .from('whatsapp_verifications')
    .delete()
    .eq('user_id', userCtx.userId)
    .eq('verified', false)

  return NextResponse.json({ success: true })
}
