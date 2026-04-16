import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan, hasActiveSubscription } from '@/lib/auth-helpers'

/**
 * GET /api/bot/actions?sessionId=xxx
 * Returns bot_actions for a given session, ordered by created_at desc, limit 50.
 * Used by PregaoLive to poll real-time lance data.
 */
export async function GET(req: NextRequest) {
  try {
    const planUser = await getUserWithPlan()
    if (!planUser) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }
    if (!hasActiveSubscription(planUser)) {
      return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
    }

    const supabase = await createClient()
    const user = { id: planUser.userId }

    const sessionId = req.nextUrl.searchParams.get('sessionId')
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Query param sessionId obrigatorio' },
        { status: 400 },
      )
    }

    const { data: profile } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) {
      return NextResponse.json({ error: 'Empresa nao configurada' }, { status: 400 })
    }

    // Verify session belongs to this company
    const { data: session } = await supabase
      .from('bot_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('company_id', profile.company_id)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Sessao nao encontrada' }, { status: 404 })
    }

    const { data: actions, error } = await supabase
      .from('bot_actions')
      .select('id, session_id, action_type, details, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[API bot/actions] GET error:', error)
      return NextResponse.json({ error: 'Erro ao listar acoes' }, { status: 500 })
    }

    return NextResponse.json({ actions: actions || [] })
  } catch (err) {
    console.error('[API bot/actions] GET error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * POST /api/bot/actions
 * Create a new bot action (e.g. manual bid recorded from the war-room UI).
 *
 * Body: { session_id, action_type, details?, idempotency_key? }
 *
 * Auth: same gate as GET — authenticated user + active subscription.
 * The earlier inconsistency (GET checked plan, POST did not) was a security
 * bug: a user with no active plan could still write audit-trail rows.
 */
export async function POST(req: NextRequest) {
  try {
    const planUser = await getUserWithPlan()
    if (!planUser) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }
    if (!hasActiveSubscription(planUser)) {
      return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
    }

    const supabase = await createClient()
    const user = { id: planUser.userId }

    const { data: profile } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) {
      return NextResponse.json({ error: 'Empresa nao configurada' }, { status: 400 })
    }

    const body = await req.json()
    const { session_id, action_type, details, idempotency_key } = body as {
      session_id?: string
      action_type?: string
      details?: Record<string, unknown>
      idempotency_key?: string
    }

    if (!session_id || !action_type) {
      return NextResponse.json(
        { error: 'Campos obrigatorios: session_id, action_type' },
        { status: 400 },
      )
    }

    // Verify session belongs to this company
    const { data: session } = await supabase
      .from('bot_sessions')
      .select('id, status')
      .eq('id', session_id)
      .eq('company_id', profile.company_id)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Sessao nao encontrada' }, { status: 404 })
    }

    // Idempotency: if the same (session_id, idempotency_key) was already
    // inserted, return it instead of creating a duplicate. Backs up the
    // partial unique index added in migration 20260416200000.
    if (idempotency_key) {
      const { data: existingAction } = await supabase
        .from('bot_actions')
        .select('*')
        .eq('session_id', session_id)
        .eq('idempotency_key', idempotency_key)
        .maybeSingle()
      if (existingAction) {
        return NextResponse.json({ action: existingAction, deduped: true }, { status: 200 })
      }
    }

    const { data: action, error } = await supabase
      .from('bot_actions')
      .insert({
        session_id,
        action_type,
        details: details || {},
        idempotency_key: idempotency_key || null,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505' && idempotency_key) {
        const { data: raced } = await supabase
          .from('bot_actions')
          .select('*')
          .eq('session_id', session_id)
          .eq('idempotency_key', idempotency_key)
          .single()
        if (raced) {
          return NextResponse.json({ action: raced, deduped: true }, { status: 200 })
        }
      }
      console.error('[API bot/actions] POST error:', error)
      return NextResponse.json({ error: 'Erro ao criar acao' }, { status: 500 })
    }

    // If it's a bid, update session progress
    if (action_type === 'bid' || action_type === 'bid_submitted' || action_type === 'bid_acknowledged') {
      try {
        await supabase
          .from('bot_sessions')
          .update({ progress: { last_bid: details, updated_at: new Date().toISOString() } })
          .eq('id', session_id)
      } catch {
        // Non-critical, ignore
      }
    }

    return NextResponse.json({ action }, { status: 201 })
  } catch (err) {
    console.error('[API bot/actions] POST error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
