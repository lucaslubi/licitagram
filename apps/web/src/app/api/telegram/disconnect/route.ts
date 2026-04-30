import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getUserWithPlan } from '@/lib/auth-helpers'

/**
 * POST /api/telegram/disconnect
 * Limpa users.telegram_chat_id e desabilita Telegram nas preferências.
 * Espelha o comportamento de /api/whatsapp/disconnect.
 */
export async function POST() {
  try {
    const userCtx = await getUserWithPlan()
    if (!userCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createClient()

    await supabase
      .from('users')
      .update({ telegram_chat_id: null })
      .eq('id', userCtx.userId)

    const { data: user } = await supabase
      .from('users')
      .select('notification_preferences')
      .eq('id', userCtx.userId)
      .single()

    if (user) {
      const prefs = (user.notification_preferences as Record<string, boolean>) || {}
      prefs.telegram = false
      await supabase
        .from('users')
        .update({ notification_preferences: prefs })
        .eq('id', userCtx.userId)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
