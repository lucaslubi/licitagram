/**
 * WhatsApp Webhook — Evolution API
 *
 * Receives incoming messages from Evolution API and processes outcome replies.
 * Users reply with 1, 2, or 3 to report bid outcomes after receiving an outcome prompt.
 *
 * The prompt includes a [ref:matchId] tag that maps replies to the correct match.
 * As a fallback, we look for the most recent pending outcome prompt sent to that number.
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Outcome mapping: reply number -> outcome value
const OUTCOME_MAP: Record<string, string> = {
  '1': 'won',
  '2': 'lost',
  '3': 'did_not_participate',
}

const OUTCOME_RESPONSES: Record<string, string> = {
  '1': '🎉 Parabéns pela vitória! Resultado registrado com sucesso.',
  '2': '😔 Resultado registrado. Continue firme, a próxima é sua!',
  '3': '👍 Registrado como não participou.',
}

// Evolution API instance for sending replies
const EVO_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080'
const EVO_KEY = process.env.EVOLUTION_API_KEY || ''
const INSTANCE = process.env.EVOLUTION_INSTANCE || 'licitagram'

async function sendReply(number: string, text: string) {
  try {
    await fetch(`${EVO_URL}/message/sendText/${INSTANCE}`, {
      method: 'POST',
      headers: {
        'apikey': EVO_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number,
        textMessage: { text },
        options: { linkPreview: false },
      }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    console.error('[whatsapp-webhook] Failed to send reply:', err)
  }
}

export async function POST(request: NextRequest) {
  // Validate Evolution API webhook secret (required in production)
  const apiKey = request.headers.get('apikey') || request.headers.get('x-api-key')
  const expectedKey = process.env.EVOLUTION_WEBHOOK_SECRET || process.env.EVOLUTION_API_KEY
  if (!expectedKey || !apiKey || apiKey.length !== expectedKey.length ||
      !timingSafeEqual(Buffer.from(apiKey), Buffer.from(expectedKey))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Evolution API sends different event types; we only care about messages
  const event = body.event as string
  if (event !== 'messages.upsert') {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const data = body.data as Record<string, unknown> | undefined
  if (!data) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  // Extract message content
  const message = data.message as Record<string, unknown> | undefined
  const key = data.key as Record<string, unknown> | undefined

  // Skip messages sent by us (fromMe)
  if (key?.fromMe) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const remoteJid = key?.remoteJid as string | undefined
  if (!remoteJid) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  // Skip group messages — only process direct messages
  if (remoteJid.endsWith('@g.us')) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  // Extract phone number from JID (format: 5511999999999@s.whatsapp.net)
  const senderNumber = remoteJid.replace('@s.whatsapp.net', '')

  // Get message text
  const messageText = (
    (message?.conversation as string) ||
    (message?.extendedTextMessage as Record<string, unknown>)?.text as string ||
    ''
  ).trim()

  // Only process single-digit replies (1, 2, or 3)
  if (!['1', '2', '3'].includes(messageText)) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const supabase = getSupabase()
  const outcomeValue = OUTCOME_MAP[messageText]

  // First: identify the user by WhatsApp number (required for authorization)
  let foundUser: { id: string; company_id: string } | null = null
  const variations = [senderNumber, `55${senderNumber}`, senderNumber.replace(/^55/, '')]
  for (const num of variations) {
    const { data: u } = await supabase
      .from('users')
      .select('id, company_id')
      .eq('whatsapp_number', num)
      .single()
    if (u) { foundUser = u; break }
  }

  if (!foundUser) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  // Strategy 1: Look for [ref:matchId] in the quoted/replied message context
  let matchId: string | null = null

  const contextInfo = (message?.extendedTextMessage as Record<string, unknown>)?.contextInfo as Record<string, unknown> | undefined
  const quotedMessage = contextInfo?.quotedMessage as Record<string, unknown> | undefined
  if (quotedMessage) {
    const quotedText = (quotedMessage.conversation as string) ||
      (quotedMessage.extendedTextMessage as Record<string, unknown>)?.text as string || ''
    const refMatch = quotedText.match(/\[ref:([a-f0-9-]+)\]/)
    if (refMatch) {
      matchId = refMatch[1]
    }
  }

  // Strategy 2: Find the most recent pending outcome for this user's company
  if (!matchId) {
    const { data: pendingMatch } = await supabase
      .rpc('get_pending_outcome_matches', {
        p_company_id: foundUser.company_id,
        p_limit: 1,
      })

    if (pendingMatch && pendingMatch.length > 0) {
      matchId = pendingMatch[0].match_id
    }
  }

  if (!matchId) {
    return NextResponse.json({ ok: true, ignored: true, reason: 'no_pending_outcome' })
  }

  // Get match details
  const { data: match } = await supabase
    .from('matches')
    .select('id, tender_id, company_id')
    .eq('id', matchId)
    .single()

  if (!match) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  // Authorization: verify the match belongs to this user's company
  if (match.company_id !== foundUser.company_id) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  // Upsert bid outcome
  const { error: upsertError } = await supabase
    .from('bid_outcomes')
    .upsert({
      match_id: matchId,
      company_id: match.company_id,
      tender_id: match.tender_id,
      outcome: outcomeValue,
      reported_via: 'whatsapp',
      reported_at: new Date().toISOString(),
    }, { onConflict: 'match_id' })

  if (upsertError) {
    console.error('[whatsapp-webhook] Failed to upsert bid_outcome:', upsertError)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  // Update match status
  const newStatus = outcomeValue === 'did_not_participate' ? 'dismissed' : outcomeValue
  await supabase
    .from('matches')
    .update({ status: newStatus })
    .eq('id', matchId)

  // Send confirmation reply
  await sendReply(senderNumber, OUTCOME_RESPONSES[messageText])

  console.log(`[whatsapp-webhook] Outcome recorded: matchId=${matchId}, outcome=${outcomeValue}, number=***${senderNumber.slice(-4)}`)

  return NextResponse.json({ ok: true })
}

// GET endpoint for Evolution API webhook verification
export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
