/**
 * Public Bot API v1 — sessions endpoint.
 *
 *   GET  /api/v1/bot/sessions            — list sessions for the bearer
 *                                          token's company.
 *   POST /api/v1/bot/sessions            — create + enqueue a session.
 *
 * Auth: bearer token in Authorization header. Scopes:
 *   - read for GET
 *   - write for POST (also read)
 *
 * The shape is intentionally a strict subset of the internal
 * /api/bot/sessions route. External clients should not see internal
 * implementation details (e.g. locked_until / worker_id are stripped).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { authenticate, requireScope } from '@/lib/api/bot-api-auth'
import { enqueueBotSession } from '@/lib/queues/bot-producer'

// Structured log helper for the public API surface.
// All rows use a `src` discriminator so they're easy to filter in the
// logs dashboard (e.g. Vercel's runtime logs UI or any Drain target).
function logApi(level: 'info' | 'warn' | 'error', msg: string, fields: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
    JSON.stringify({ src: 'api.v1.bot.sessions', level, msg, ...fields }),
  )
}

function newRequestId(): string {
  return (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// Public shape — only safe fields.
function publicSession(row: Record<string, unknown>) {
  return {
    id: row.id,
    pregao_id: row.pregao_id,
    portal: row.portal,
    status: row.status,
    mode: row.mode,
    strategy_config: row.strategy_config,
    min_price: row.min_price,
    max_bids: row.max_bids,
    bids_placed: row.bids_placed,
    current_price: row.current_price,
    started_at: row.started_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
    result: row.result,
  }
}

export async function GET(req: NextRequest) {
  const reqId = newRequestId()
  const startedAt = Date.now()
  try {
    const auth = await authenticate(req)
    if (!auth.ok) {
      logApi('warn', 'auth_failed', { reqId, method: 'GET', status: auth.status })
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    if (!requireScope(auth.key, 'read')) {
      logApi('warn', 'scope_denied', { reqId, method: 'GET', keyId: auth.key.keyId, required: 'read' })
      return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 })
    }

    const limit = Math.min(
      Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '50', 10), 1),
      200,
    )
    const status = req.nextUrl.searchParams.get('status')

    const supabase = getServiceSupabase()
    let query = supabase
      .from('bot_sessions')
      .select(
        'id, pregao_id, portal, status, mode, strategy_config, min_price, max_bids, bids_placed, current_price, started_at, completed_at, created_at, result',
      )
      .eq('company_id', auth.key.companyId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) {
      logApi('error', 'query_failed', {
        reqId,
        method: 'GET',
        companyId: auth.key.companyId,
        keyId: auth.key.keyId,
        err: error.message,
      })
      return NextResponse.json({ error: 'query_failed' }, { status: 500 })
    }

    const rows = data ?? []
    logApi('info', 'list_sessions_ok', {
      reqId,
      method: 'GET',
      companyId: auth.key.companyId,
      keyId: auth.key.keyId,
      count: rows.length,
      durationMs: Date.now() - startedAt,
    })

    return NextResponse.json({
      data: rows.map((r) => publicSession(r as Record<string, unknown>)),
    })
  } catch (err) {
    logApi('error', 'unhandled', {
      reqId,
      method: 'GET',
      err: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const reqId = newRequestId()
  const startedAt = Date.now()
  try {
    const auth = await authenticate(req)
    if (!auth.ok) {
      logApi('warn', 'auth_failed', { reqId, method: 'POST', status: auth.status })
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    if (!requireScope(auth.key, 'write')) {
      logApi('warn', 'scope_denied', { reqId, method: 'POST', keyId: auth.key.keyId, required: 'write' })
      return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      logApi('warn', 'invalid_json', { reqId, keyId: auth.key.keyId })
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }

    const {
      config_id,
      pregao_id,
      portal,
      min_price,
      max_bids,
      strategy,
      mode,
      idempotency_key,
    } = (body ?? {}) as Record<string, unknown>

    if (typeof config_id !== 'string' || typeof pregao_id !== 'string') {
      logApi('warn', 'validation_failed', { reqId, keyId: auth.key.keyId, field: 'config_id_or_pregao_id' })
      return NextResponse.json(
        { error: 'config_id and pregao_id are required strings' },
        { status: 400 },
      )
    }

    const validModes = ['supervisor', 'auto_bid', 'shadow']
    const finalMode = (typeof mode === 'string' && validModes.includes(mode)) ? mode : 'supervisor'

    const supabase = getServiceSupabase()

    // Verify the config belongs to the API key's company.
    const { data: cfg } = await supabase
      .from('bot_configs')
      .select('id, portal, strategy')
      .eq('id', config_id)
      .eq('company_id', auth.key.companyId)
      .single()
    if (!cfg) {
      logApi('warn', 'config_not_found', { reqId, keyId: auth.key.keyId, configId: config_id })
      return NextResponse.json({ error: 'config_not_found' }, { status: 404 })
    }

    // Idempotency dedup
    if (typeof idempotency_key === 'string' && idempotency_key.length > 0) {
      const { data: existing } = await supabase
        .from('bot_sessions')
        .select('*')
        .eq('company_id', auth.key.companyId)
        .eq('idempotency_key', idempotency_key)
        .maybeSingle()
      if (existing) {
        logApi('info', 'session_deduped', {
          reqId,
          keyId: auth.key.keyId,
          sessionId: (existing as { id: string }).id,
          durationMs: Date.now() - startedAt,
        })
        return NextResponse.json({ data: publicSession(existing as Record<string, unknown>), deduped: true })
      }
    }

    const { data: session, error: insErr } = await supabase
      .from('bot_sessions')
      .insert({
        company_id: auth.key.companyId,
        config_id,
        pregao_id,
        portal: (portal as string) ?? cfg.portal,
        strategy_config: { type: (strategy as string) ?? cfg.strategy },
        min_price: typeof min_price === 'number' ? min_price : null,
        max_bids: typeof max_bids === 'number' ? max_bids : null,
        status: 'pending',
        mode: finalMode,
        idempotency_key: typeof idempotency_key === 'string' ? idempotency_key : null,
      })
      .select()
      .single()

    if (insErr) {
      if (insErr.code === '23505' && typeof idempotency_key === 'string') {
        const { data: raced } = await supabase
          .from('bot_sessions')
          .select('*')
          .eq('company_id', auth.key.companyId)
          .eq('idempotency_key', idempotency_key)
          .single()
        if (raced) {
          logApi('info', 'session_deduped_race', {
            reqId,
            keyId: auth.key.keyId,
            sessionId: (raced as { id: string }).id,
          })
          return NextResponse.json({ data: publicSession(raced as Record<string, unknown>), deduped: true })
        }
      }
      logApi('error', 'insert_failed', { reqId, keyId: auth.key.keyId, err: insErr.message })
      return NextResponse.json({ error: 'insert_failed', detail: insErr.message }, { status: 500 })
    }

    try {
      await enqueueBotSession(session.id, 'initial', 0)
    } catch (err) {
      logApi('error', 'enqueue_failed', {
        reqId,
        keyId: auth.key.keyId,
        sessionId: session.id,
        err: err instanceof Error ? err.message : String(err),
      })
      return NextResponse.json(
        {
          data: publicSession(session as Record<string, unknown>),
          warning: 'session_created_but_queue_unavailable',
          detail: err instanceof Error ? err.message : String(err),
        },
        { status: 201 },
      )
    }

    logApi('info', 'session_created', {
      reqId,
      keyId: auth.key.keyId,
      sessionId: session.id,
      mode: finalMode,
      portal: (portal as string) ?? cfg.portal,
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json({ data: publicSession(session as Record<string, unknown>) }, { status: 201 })
  } catch (err) {
    logApi('error', 'unhandled', {
      reqId,
      method: 'POST',
      err: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
