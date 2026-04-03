import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan } from '@/lib/auth-helpers'

/**
 * GET /api/notifications — List notifications (paginated)
 * Query: ?page=1&unreadOnly=true
 *
 * PATCH /api/notifications — Mark as read
 * Body: { ids: string[] } or { markAllRead: true }
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const unreadOnly = searchParams.get('unreadOnly') === 'true'
    const pageSize = 20
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const supabase = await createClient()

    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', user.userId)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (unreadOnly) query = query.eq('read', false)

    const { data: notifications, count, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Get unread count
    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.userId)
      .eq('read', false)

    return NextResponse.json({
      notifications: notifications || [],
      total: count || 0,
      unreadCount: unreadCount || 0,
      page,
      totalPages: Math.ceil((count || 0) / pageSize),
    })
  } catch (err) {
    console.error('[notifications]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const supabase = await createClient()

    if (body.markAllRead) {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.userId)
        .eq('read', false)
    } else if (body.ids && Array.isArray(body.ids)) {
      await supabase
        .from('notifications')
        .update({ read: true })
        .in('id', body.ids)
        .eq('user_id', user.userId)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[notifications PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
