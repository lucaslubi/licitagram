/**
 * WhatsApp Inbound Webhook (WAHA) — Outbound Reply + Opt-out Tracking
 *
 * Listens for incoming WhatsApp messages tied to outbound prospecting campaigns.
 * Handles two cases:
 *   1. Opt-out keywords (PARAR, PARE, SAIR, CANCELAR, STOP, UNSUBSCRIBE)
 *      → Insert into outbound_optouts + send confirmation reply.
 *   2. Any other reply from a number we sent to recently
 *      → Mark the most-recent sent message as `replied`.
 *
 * Configure in WAHA: webhook URL = https://licitagram.com/api/webhooks/whatsapp-inbound
 *                    auth header  X-Api-Key: <WAHA_API_KEY>
 *
 * NOTE: this is intentionally separate from /api/webhooks/whatsapp which
 * handles bid-outcome replies (1/2/3) for clients that already onboarded.
 */
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const OPT_OUT_KEYWORDS = new Set([
  'PARAR', 'PARE', 'SAIR', 'CANCELAR', 'CANCELE', 'STOP', 'UNSUBSCRIBE', 'REMOVER', 'NAO', 'NÃO',
])

const OPT_OUT_REPLY =
  'Tudo bem! Você foi removido(a) da nossa lista. Não enviaremos mais mensagens. — Equipe Licitagram'

const WAHA_URL = process.env.WAHA_URL || process.env.EVOLUTION_API_URL || 'http://127.0.0.1:3000'
const WAHA_KEY = process.env.WAHA_API_KEY || process.env.EVOLUTION_API_KEY || ''
const WAHA_SESSION = process.env.WAHA_SESSION || 'default'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function sendReply(chatId: string, text: string) {
  try {
    await fetch(`${WAHA_URL}/api/sendText`, {
      method: 'POST',
      headers: { 'X-Api-Key': WAHA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: WAHA_SESSION, chatId, text, linkPreview: false }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    console.error('[whatsapp-inbound] reply failed:', err)
  }
}

function safeAuth(req: NextRequest): boolean {
  const provided = req.headers.get('x-api-key') || req.headers.get('apikey')
  if (!WAHA_KEY) return false
  if (!provided) return false
  if (provided.length !== WAHA_KEY.length) return false
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(WAHA_KEY))
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  if (!safeAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  // WAHA event payload shapes:
  //   { event: 'message', payload: { from: '5511...@c.us', body: 'PARAR', fromMe: false } }
  // Some deployments use top-level `data` instead of `payload`.
  const event = body.event || body.type
  const payload = body.payload || body.data || {}

  if (event && !/message/i.test(event)) {
    return NextResponse.json({ ok: true, ignored: 'event' })
  }

  const fromMe = payload?.fromMe === true || payload?.key?.fromMe === true
  if (fromMe) return NextResponse.json({ ok: true, ignored: 'fromMe' })

  const fromRaw: string =
    payload.from ||
    payload.chatId ||
    payload?.key?.remoteJid ||
    ''

  if (!fromRaw || fromRaw.endsWith('@g.us')) {
    return NextResponse.json({ ok: true, ignored: 'group_or_no_from' })
  }

  // Strip @c.us / @s.whatsapp.net suffix → digits only
  const phone = fromRaw.replace(/@.*/, '').replace(/\D/g, '')
  if (!phone) return NextResponse.json({ ok: true, ignored: 'no_phone' })

  const text: string = (
    payload.body ||
    payload?.message?.conversation ||
    payload?.message?.extendedTextMessage?.text ||
    ''
  )
    .toString()
    .trim()

  const supabase = getSupabase()

  // Resolve outbound_messages row(s) sent to this phone (most recent first)
  // We try multiple phone variations because WAHA sometimes drops the trailing 9.
  const variations = Array.from(new Set([
    phone,
    phone.length === 12 && phone.startsWith('55') ? phone.slice(0, 4) + '9' + phone.slice(4) : phone,
    phone.length === 13 && phone.startsWith('55') && phone[4] === '9' ? phone.slice(0, 4) + phone.slice(5) : phone,
  ]))

  const { data: recentMsgs } = await supabase
    .from('outbound_messages')
    .select('id, lead_cnpj, to_address, status, sent_at')
    .in('to_address', variations)
    .in('status', ['sent', 'delivered', 'read'])
    .order('sent_at', { ascending: false })
    .limit(1)

  const lastMsg = (recentMsgs || [])[0] || null

  // ── Opt-out flow ──────────────────────────────────────────────────────────
  const upper = text.toUpperCase().replace(/[.,!?;:]+$/g, '').trim()
  const isOptOut =
    OPT_OUT_KEYWORDS.has(upper) ||
    /^(PARAR|PARE|SAIR|CANCELAR|STOP|UNSUBSCRIBE|REMOVER|N[ÃA]O\s+QUERO)/i.test(upper)

  if (isOptOut) {
    await supabase.from('outbound_optouts').upsert(
      {
        cnpj: lastMsg?.lead_cnpj || null,
        whatsapp: phone,
        channel: 'whatsapp',
        source: 'whatsapp_keyword',
        reason: text.slice(0, 200),
      },
      { onConflict: 'cnpj,channel', ignoreDuplicates: false },
    )

    // Also mark the last message as opted_out so dashboards reflect it
    if (lastMsg) {
      await supabase
        .from('outbound_messages')
        .update({
          status: 'opted_out',
          replied_at: new Date().toISOString(),
          metadata: { reply_text: text.slice(0, 1000), opt_out: true },
        })
        .eq('id', lastMsg.id)
    }

    await sendReply(fromRaw.includes('@') ? fromRaw : `${phone}@c.us`, OPT_OUT_REPLY)
    console.log(`[whatsapp-inbound] OPT-OUT phone=***${phone.slice(-4)} cnpj=${lastMsg?.lead_cnpj || 'unknown'}`)
    return NextResponse.json({ ok: true, action: 'opted_out' })
  }

  // ── Reply tracking (any non-opt-out text) ────────────────────────────────
  if (lastMsg && text.length > 0) {
    await supabase
      .from('outbound_messages')
      .update({
        status: 'replied',
        replied_at: new Date().toISOString(),
        metadata: { reply_text: text.slice(0, 1000) },
      })
      .eq('id', lastMsg.id)
    console.log(`[whatsapp-inbound] REPLY captured msg=${lastMsg.id} phone=***${phone.slice(-4)}`)
    return NextResponse.json({ ok: true, action: 'reply_recorded' })
  }

  return NextResponse.json({ ok: true, action: 'no_match' })
}

export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'whatsapp-inbound' })
}
