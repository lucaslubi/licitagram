/**
 * PATCH /api/bot/sessions/:id/strategy
 *
 * Edita strategy de uma sessão ATIVA sem reiniciar. O loop interno do
 * runner faz poll do DB a cada 1s e propaga pro engine via setRateLimit
 * + baseStrategy.chaoFinanceiro (F5). Latência observada: <1s entre
 * PATCH e propagação ao engine.
 *
 * Body aceita:
 *   - min_price: number (piso global)
 *   - mode: 'supervisor' | 'auto_bid' | 'shadow'
 *   - strategy_config.{minDelayBetweenOwnBidsMs, maxBidsPerMinute,
 *                      stopLossPct, stopLossWindowSec, puloMinimo, puloMaximo}
 *   - status: 'paused' | 'active' | 'cancelled'  (PAUSE/RESUME/PANIC)
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const VALID_STATUS = new Set(['paused', 'active', 'cancelled'])
const VALID_MODE = new Set(['supervisor', 'auto_bid', 'shadow'])

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const sessionId = params.id
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verifica que a sessão pertence à empresa do user
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
    .select('id, status, mode, min_price, strategy_config, company_id')
    .eq('id', sessionId)
    .eq('company_id', profile.company_id)
    .maybeSingle()
  if (!session) {
    return NextResponse.json({ error: 'Sessao nao encontrada' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  // Floor edit
  if (typeof body.min_price === 'number') {
    if (body.min_price <= 0) {
      return NextResponse.json(
        { error: 'min_price deve ser > 0' },
        { status: 400 },
      )
    }
    updates.min_price = body.min_price
  }

  // Mode change
  if (typeof body.mode === 'string') {
    if (!VALID_MODE.has(body.mode)) {
      return NextResponse.json(
        { error: `mode invalido. Use: ${Array.from(VALID_MODE).join(', ')}` },
        { status: 400 },
      )
    }
    // Auto_bid exige piso (F2 — defesa em profundidade)
    const newPiso = (updates.min_price as number | undefined) ?? session.min_price
    if (body.mode === 'auto_bid' && (typeof newPiso !== 'number' || newPiso <= 0)) {
      return NextResponse.json(
        { error: 'auto_bid requer min_price > 0', code: 'piso_obrigatorio' },
        { status: 400 },
      )
    }
    updates.mode = body.mode
  }

  // Status (PAUSE/RESUME/PANIC)
  if (typeof body.status === 'string') {
    if (!VALID_STATUS.has(body.status)) {
      return NextResponse.json(
        { error: `status invalido. Use: ${Array.from(VALID_STATUS).join(', ')}` },
        { status: 400 },
      )
    }
    updates.status = body.status
    if (body.status === 'cancelled') {
      updates.completed_at = new Date().toISOString()
    }
  }

  // strategy_config patch (merge raso)
  if (body.strategy_config && typeof body.strategy_config === 'object') {
    const incoming = body.strategy_config as Record<string, unknown>
    const cur = (session.strategy_config as Record<string, unknown> | null) || {}
    const merged: Record<string, unknown> = { ...cur }
    for (const k of [
      'minDelayBetweenOwnBidsMs',
      'maxBidsPerMinute',
      'stopLossPct',
      'stopLossWindowSec',
      'puloMinimo',
      'puloMaximo',
      'lanceFechado',
      'delayMin',
      'delayMax',
      'standbyMin',
    ]) {
      if (typeof incoming[k] === 'number') merged[k] = incoming[k]
    }
    updates.strategy_config = merged
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'sem campos pra atualizar' }, { status: 400 })
  }

  const { error: updErr } = await supabase
    .from('bot_sessions')
    .update(updates)
    .eq('id', sessionId)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // Audit (best-effort)
  try {
    await supabase.from('bot_actions').insert({
      session_id: sessionId,
      action_type: 'strategy_patch',
      details: { updates, by_user_id: user.id },
    })
  } catch {
    /* ignore */
  }

  return NextResponse.json({
    ok: true,
    updates,
    note: 'Engine propaga em até 1s via poll do runner (F5).',
  })
}
