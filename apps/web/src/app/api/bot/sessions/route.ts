import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithPlan, hasActiveSubscription } from '@/lib/auth-helpers'

/**
 * GET /api/bot/sessions
 * List bot sessions for the authenticated user's company.
 */
export async function GET() {
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

    const { data: sessions, error } = await supabase
      .from('bot_sessions')
      .select('*, bot_actions(id, action_type, details, created_at)')
      .eq('company_id', profile.company_id)
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
    const planUserPost = await getUserWithPlan()
    if (!planUserPost) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }
    if (!hasActiveSubscription(planUserPost)) {
      return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
    }

    const supabase = await createClient()
    const user = { id: planUserPost.userId }

    const { data: profile } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) {
      return NextResponse.json({ error: 'Empresa nao configurada' }, { status: 400 })
    }

    const body = await req.json()
    const {
      config_id,
      pregao_id,
      portal,
      min_price,
      max_bids,
      strategy,
      mode,
      idempotency_key,
    } = body as {
      config_id?: string
      pregao_id?: string
      portal?: string
      min_price?: number
      max_bids?: number
      strategy?: string
      mode?: string
      idempotency_key?: string
    }

    if (!config_id || !pregao_id) {
      return NextResponse.json(
        { error: 'Campos obrigatorios: config_id, pregao_id' },
        { status: 400 },
      )
    }

    // Validate mode
    const validModes = ['supervisor', 'auto_bid', 'shadow']
    const finalMode = mode ?? 'supervisor'
    if (!validModes.includes(finalMode)) {
      return NextResponse.json(
        { error: `Mode invalido. Use: ${validModes.join(', ')}` },
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

    // Idempotency: if the client supplied a key that's already in use for
    // this company, return the existing session instead of creating a dup.
    if (idempotency_key) {
      const { data: existing } = await supabase
        .from('bot_sessions')
        .select('*')
        .eq('company_id', profile.company_id)
        .eq('idempotency_key', idempotency_key)
        .maybeSingle()

      if (existing) {
        return NextResponse.json({ session: existing, deduped: true }, { status: 200 })
      }
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
      mode: finalMode,
      idempotency_key: idempotency_key || null,
    }

    const { data: session, error } = await supabase
      .from('bot_sessions')
      .insert(record)
      .select()
      .single()

    if (error) {
      // Unique constraint on idempotency_key may have raced
      if (error.code === '23505' && idempotency_key) {
        const { data: raced } = await supabase
          .from('bot_sessions')
          .select('*')
          .eq('company_id', profile.company_id)
          .eq('idempotency_key', idempotency_key)
          .single()
        if (raced) {
          return NextResponse.json({ session: raced, deduped: true }, { status: 200 })
        }
      }
      console.error('[API bot/sessions] INSERT error:', error)
      return NextResponse.json({ error: 'Erro ao criar sessao' }, { status: 500 })
    }

    // TODO(phase-1): enqueue BullMQ job `bot.session.start` here — the
    // dedicated queue + worker lands in Phase 1. Until then, sessions sit
    // in `pending` and the legacy Python worker picks them up (if running)
    // or the watchdog reaps them after heartbeat timeout.

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
    const planUserPatch = await getUserWithPlan()
    if (!planUserPatch) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }
    if (!hasActiveSubscription(planUserPatch)) {
      return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
    }

    const supabase = await createClient()
    const user = { id: planUserPatch.userId }

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

    // Guard: disallow moving OUT of terminal states back to pending/etc.
    const terminal = new Set(['completed', 'failed', 'cancelled'])
    if (terminal.has(existing.status) && action !== 'cancel') {
      return NextResponse.json(
        { error: `Sessao ja esta em estado terminal (${existing.status}); acoes pause/resume bloqueadas` },
        { status: 409 },
      )
    }

    const statusMap: Record<string, string> = {
      pause: 'paused',
      resume: 'pending',  // worker polls for 'pending' status
      cancel: 'cancelled', // valid after migration 20260416200000_bot_phase0_hardening
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
