import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getUserWithPlan } from '@/lib/auth-helpers'

/**
 * GET /api/notifications/count — Returns unread notification count (for badge)
 */
export async function GET() {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ unreadCount: 0 })

    const supabase = await createClient()
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.userId)
      .eq('read', false)

    return NextResponse.json({ unreadCount: count || 0 })
  } catch {
    return NextResponse.json({ unreadCount: 0 })
  }
}
