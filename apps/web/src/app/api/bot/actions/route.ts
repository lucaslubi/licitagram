import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/bot/actions?sessionId=xxx
 * Returns bot_actions for a given session, ordered by created_at desc, limit 50.
 * Used by PregaoLive to poll real-time lance data.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

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
 * Create a new bot action (e.g. manual bid).
 *
 * Body: { session_id, action_type, details }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) {
      return NextResponse.json({ error: 'Empresa nao configurada' }, { status: 400 })
    }

    const body = await req.json()
    const { session_id, action_type, details } = body

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

    const { data: action, error } = await supabase
      .from('bot_actions')
      .insert({
        session_id,
        action_type,
        details: details || {},
      })
      .select()
      .single()

    if (error) {
      console.error('[API bot/actions] POST error:', error)
      return NextResponse.json({ error: 'Erro ao criar acao' }, { status: 500 })
    }

    // If it's a bid, update session progress
    if (action_type === 'bid') {
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
