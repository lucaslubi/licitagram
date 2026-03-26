import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/bot/sessions
 * List bot sessions for the authenticated user's company.
 */
export async function GET() {
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

    // Get all company IDs in this user's group for cross-company data
    const { data: userCompanies } = await supabase
      .from('user_companies')
      .select('company_id')
      .eq('user_id', user.id)
    const groupCompanyIds = userCompanies?.map((uc: any) => uc.company_id) || [profile.company_id]

    const { data: sessions, error } = await supabase
      .from('bot_sessions')
      .select('*, bot_actions(id, action_type, details, created_at)')
      .in('company_id', groupCompanyIds)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[API bot/sessions] GET error:', error)
      return NextResponse.json({ error: 'Erro ao listar sessoes' }, { status: 500 })
    }

    return NextResponse.json({ sessions })
  } catch (err) {
    console.error('[API bot/sessions] GET error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * POST /api/bot/sessions
 * Create a new bot session (start a bot for a pregao).
 *
 * Body: { config_id, pregao_id, portal?, min_price?, max_bids?, strategy? }
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
    const { config_id, pregao_id, portal, min_price, max_bids, strategy } = body

    if (!config_id || !pregao_id) {
      return NextResponse.json(
        { error: 'Campos obrigatorios: config_id, pregao_id' },
        { status: 400 },
      )
    }

    // Verify config belongs to this company
    const { data: config } = await supabase
      .from('bot_configs')
      .select('id, portal, strategy')
      .eq('id', config_id)
      .eq('company_id', profile.company_id)
      .single()

    if (!config) {
      return NextResponse.json({ error: 'Configuracao nao encontrada' }, { status: 404 })
    }

    const record = {
      company_id: profile.company_id,
      config_id,
      pregao_id,
      portal: portal || config.portal,
      strategy_config: { type: strategy || config.strategy },
      min_price: min_price || null,
      max_bids: max_bids || null,
      status: 'pending',
    }

    const { data: session, error } = await supabase
      .from('bot_sessions')
      .insert(record)
      .select()
      .single()

    if (error) {
      console.error('[API bot/sessions] INSERT error:', error)
      return NextResponse.json({ error: 'Erro ao criar sessao' }, { status: 500 })
    }

    return NextResponse.json({ session }, { status: 201 })
  } catch (err) {
    console.error('[API bot/sessions] POST error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * PATCH /api/bot/sessions
 * Update a session (pause/resume/cancel).
 *
 * Body: { id, action: 'pause' | 'resume' | 'cancel' }
 */
export async function PATCH(req: NextRequest) {
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
    const { id, action } = body

    if (!id || !action) {
      return NextResponse.json(
        { error: 'Campos obrigatorios: id, action' },
        { status: 400 },
      )
    }

    const validActions = ['pause', 'resume', 'cancel']
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `Acao invalida. Use: ${validActions.join(', ')}` },
        { status: 400 },
      )
    }

    // Verify session belongs to this company
    const { data: existing } = await supabase
      .from('bot_sessions')
      .select('id, status')
      .eq('id', id)
      .eq('company_id', profile.company_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Sessao nao encontrada' }, { status: 404 })
    }

    const statusMap: Record<string, string> = {
      pause: 'paused',
      resume: 'pending',  // worker polls for 'pending' status
      cancel: 'failed',
    }

    const updatePayload: Record<string, unknown> = { status: statusMap[action] }

    if (action === 'cancel') {
      updatePayload.completed_at = new Date().toISOString()
      updatePayload.result = { error: 'Cancelado pelo usuario' }
    }

    const { data: updated, error } = await supabase
      .from('bot_sessions')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[API bot/sessions] PATCH error:', error)
      return NextResponse.json({ error: 'Erro ao atualizar sessao' }, { status: 500 })
    }

    return NextResponse.json({ session: updated })
  } catch (err) {
    console.error('[API bot/sessions] PATCH error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
