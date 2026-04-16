/**
 * GET /api/bot/events?sessionId=<uuid>&kind=<optional>&since=<optional ISO>
 *
 * Paginated, ordered feed of bot_events rows for a session. Powers the
 * Forensic Replay timeline: the UI pulls the initial window on mount and
 * then subscribes to Supabase Realtime for live updates.
 *
 * Auth: authenticated user + active subscription + session belongs to
 * user's company.
 *
 * Response shape:
 *   { events: Array<{ id, t_ms, kind, payload, occurred_at, latency_ms }>,
 *     next_cursor: string | null,
 *     total_ms: number | null }
 *
 * The `total_ms` field is the span between first and last event — useful
 * for the scrubber UI to know the total timeline length without another
 * query.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan, hasActiveSubscription } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  try {
    const planUser = await getUserWithPlan()
    if (!planUser) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }
    if (!hasActiveSubscription(planUser)) {
      return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
    }

    const sessionId = req.nextUrl.searchParams.get('sessionId')
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Query param sessionId obrigatorio' },
        { status: 400 },
      )
    }

    const kindFilter = req.nextUrl.searchParams.get('kind') || null
    const since = req.nextUrl.searchParams.get('since') || null
    const limit = Math.min(
      Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '500', 10), 1),
      2000,
    )

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    // Verify session belongs to this company.
    const { data: profile } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .single()
    if (!profile?.company_id) {
      return NextResponse.json({ error: 'Empresa nao configurada' }, { status: 400 })
    }
    const { data: session } = await supabase
      .from('bot_sessions')
      .select('id, started_at, completed_at')
      .eq('id', sessionId)
      .eq('company_id', profile.company_id)
      .single()
    if (!session) {
      return NextResponse.json({ error: 'Sessao nao encontrada' }, { status: 404 })
    }

    let query = supabase
      .from('bot_events')
      .select('id, t_ms, kind, payload, occurred_at, latency_ms')
      .eq('session_id', sessionId)
      .order('occurred_at', { ascending: true })
      .limit(limit)

    if (kindFilter) {
      query = query.eq('kind', kindFilter)
    }
    if (since) {
      query = query.gt('occurred_at', since)
    }

    const { data: events, error } = await query
    if (error) {
      console.error('[API bot/events] GET error:', error)
      return NextResponse.json({ error: 'Erro ao listar eventos' }, { status: 500 })
    }

    // total_ms derived from session bounds when available.
    let totalMs: number | null = null
    if (session.started_at) {
      const start = Date.parse(session.started_at)
      const end = session.completed_at ? Date.parse(session.completed_at) : Date.now()
      if (Number.isFinite(start) && Number.isFinite(end)) {
        totalMs = Math.max(0, end - start)
      }
    }

    const nextCursor =
      events && events.length === limit ? events[events.length - 1].occurred_at : null

    return NextResponse.json({
      events: events ?? [],
      next_cursor: nextCursor,
      total_ms: totalMs,
    })
  } catch (err) {
    console.error('[API bot/events] GET error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
