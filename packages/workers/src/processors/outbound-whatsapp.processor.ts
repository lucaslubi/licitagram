/**
 * Outbound WhatsApp Send Processor — HARDENED ANTI-BAN
 *
 * Lê outbound_messages.id do job, valida (status='queued', approved_by_admin=true,
 * not opted-out, dentro de horário comercial, sob daily cap, kill switch off),
 * envia via WAHA (sessão DEDICADA pra outbound — NUNCA o número principal),
 * atualiza status.
 *
 * Guard-rails anti-ban:
 *   1. Sessão WAHA dedicada (WAHA_OUTBOUND_SESSION + WAHA_OUTBOUND_URL/KEY).
 *      Hard-fail se não configurado — worker NÃO usa o número principal.
 *   2. Rate limit: 1 msg / 60s (limiter) + concurrency 1.
 *   3. Daily cap por instância (env WHATSAPP_OUTBOUND_DAILY_CAP, default 15).
 *   4. Quiet hours dura: 9h-18h BRT, dias úteis (sáb/dom = quiet).
 *   5. Kill switch: arquivo /tmp/outbound-disabled pausa todos os jobs.
 *   6. Validação humana: requer approved_by_admin=true antes de enviar.
 *   7. Test mode: WHATSAPP_TEST_PHONE redireciona TODAS as mensagens.
 *   8. Permanent-error fail-fast pra evitar loops em ban.
 */
import { Worker, UnrecoverableError, DelayedError } from 'bullmq'
import { existsSync } from 'node:fs'
import { connection } from '../queues/connection'
import type { OutboundWhatsappJobData } from '../queues/outbound-whatsapp.queue'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

// ──────────────────────────────────────────────────────────────────────
// Config (dedicated outbound — NEVER reuses the main WAHA session)
// ──────────────────────────────────────────────────────────────────────
const WAHA_OUTBOUND_URL = process.env.WAHA_OUTBOUND_URL || ''
const WAHA_OUTBOUND_KEY = process.env.WAHA_OUTBOUND_API_KEY || ''
const WAHA_OUTBOUND_SESSION = process.env.WAHA_OUTBOUND_SESSION || ''
const DAILY_CAP = parseInt(process.env.WHATSAPP_OUTBOUND_DAILY_CAP || '15', 10)
const TEST_PHONE = process.env.WHATSAPP_TEST_PHONE || ''
const KILL_SWITCH_PATH = process.env.OUTBOUND_KILL_SWITCH_PATH || '/tmp/outbound-disabled'

const OUTBOUND_CONFIGURED = Boolean(WAHA_OUTBOUND_URL && WAHA_OUTBOUND_KEY && WAHA_OUTBOUND_SESSION)

if (!OUTBOUND_CONFIGURED) {
  logger.warn(
    {
      hasUrl: !!WAHA_OUTBOUND_URL,
      hasKey: !!WAHA_OUTBOUND_KEY,
      hasSession: !!WAHA_OUTBOUND_SESSION,
    },
    'OUTBOUND DISABLED — WAHA_OUTBOUND_URL / WAHA_OUTBOUND_API_KEY / WAHA_OUTBOUND_SESSION ausentes. ' +
      'Worker outbound-whatsapp NÃO enviará nada até config. Isso é proposital pra não cair no número principal.',
  )
}
if (TEST_PHONE) {
  logger.warn({ testPhone: '***' + TEST_PHONE.slice(-4) }, 'WHATSAPP_TEST_PHONE ativo — TODAS msgs irão pra esse número')
}

// Quiet hours config: 9h-18h BRT, dias úteis (seg-sex)
const BUSINESS_START_HOUR_BRT = 9
const BUSINESS_END_HOUR_BRT = 18

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────
function brtParts(date = new Date()): { hour: number; dow: number } {
  // BRT = UTC-3 sem DST
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60_000
  const brt = new Date(utcMs - 3 * 60 * 60_000)
  return { hour: brt.getHours(), dow: brt.getDay() }
}

function isQuietHours(): boolean {
  const { hour, dow } = brtParts()
  if (dow === 0 || dow === 6) return true // domingo / sábado
  return hour < BUSINESS_START_HOUR_BRT || hour >= BUSINESS_END_HOUR_BRT
}

function delayUntilNextWindow(): number {
  const now = new Date()
  for (let addDays = 0; addDays < 8; addDays++) {
    const candidate = new Date(now.getTime() + addDays * 24 * 60 * 60_000)
    candidate.setUTCHours(BUSINESS_START_HOUR_BRT + 3, 0, 0, 0) // 9h BRT == 12h UTC
    // jitter 0-2h dentro da janela
    const jitterMs = Math.floor(Math.random() * 2 * 60 * 60_000)
    const target = candidate.getTime() + jitterMs
    if (target <= now.getTime()) continue
    const { dow } = brtParts(new Date(target))
    if (dow === 0 || dow === 6) continue // pula fim de semana
    return Math.max(target - now.getTime(), 60_000)
  }
  return 24 * 60 * 60_000
}

async function wahaOutboundFetch(path: string, body?: unknown, method: 'GET' | 'POST' = 'POST'): Promise<unknown> {
  const res = await fetch(`${WAHA_OUTBOUND_URL}${path}`, {
    method,
    headers: {
      'X-Api-Key': WAHA_OUTBOUND_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`WAHA-OUT ${res.status}: ${errText.slice(0, 300)}`)
  }
  return res.json().catch(() => ({}))
}

async function isOutboundSessionConnected(): Promise<boolean> {
  if (!OUTBOUND_CONFIGURED) return false
  try {
    const data = (await wahaOutboundFetch(`/api/sessions/${WAHA_OUTBOUND_SESSION}`, undefined, 'GET')) as {
      status?: string
    }
    return data?.status === 'WORKING'
  } catch {
    return false
  }
}

async function sendOutboundText(number: string, text: string): Promise<{ id?: string }> {
  const digits = number.replace(/\D/g, '')
  // não usa /api/contacts/check-exists pra evitar fingerprint adicional
  const chatId = digits.includes('@') ? digits : `${digits}@c.us`
  return wahaOutboundFetch(`/api/sendText`, {
    session: WAHA_OUTBOUND_SESSION,
    chatId,
    text,
    linkPreview: false,
  }) as Promise<{ id?: string }>
}

async function countSentLast24h(): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await supabase
    .from('outbound_messages')
    .select('id', { count: 'exact', head: true })
    .eq('channel', 'whatsapp')
    .in('status', ['sent', 'delivered', 'read', 'replied'])
    .gte('sent_at', since)
  if (error) {
    logger.warn({ err: error.message }, 'countSentLast24h failed — assuming 0')
    return 0
  }
  return count || 0
}

// ──────────────────────────────────────────────────────────────────────
// Worker
// ──────────────────────────────────────────────────────────────────────
const outboundWhatsappWorker = new Worker<OutboundWhatsappJobData>(
  'outbound-whatsapp',
  async (job) => {
    const { outboundMessageId } = job.data
    const log = logger.child({ jobId: job.id, msgId: outboundMessageId })

    // 0. Hard-fail se não configurado — falha alta visibilidade, msg fica queued pra retomar
    if (!OUTBOUND_CONFIGURED) {
      throw new UnrecoverableError(
        'OUTBOUND DISABLED — config WAHA_OUTBOUND_URL / WAHA_OUTBOUND_API_KEY / WAHA_OUTBOUND_SESSION ausente',
      )
    }

    // 0.1. Kill switch
    if (existsSync(KILL_SWITCH_PATH)) {
      log.warn({ path: KILL_SWITCH_PATH }, 'Kill switch ativo — pausando 60s')
      await job.moveToDelayed(Date.now() + 60_000, job.token)
      throw new DelayedError()
    }

    // 0.2. Quiet hours (dias úteis 9-18 BRT)
    if (isQuietHours()) {
      const delayMs = delayUntilNextWindow()
      log.info({ delayMs, hours: Math.round(delayMs / 3600_000) }, 'Quiet hours — deferring')
      await job.moveToDelayed(Date.now() + delayMs, job.token)
      throw new DelayedError()
    }

    // 0.3. Daily cap
    const sentToday = await countSentLast24h()
    if (sentToday >= DAILY_CAP) {
      const delayMs = delayUntilNextWindow()
      log.warn({ sentToday, cap: DAILY_CAP, delayMs }, 'Daily cap reached — deferring')
      await job.moveToDelayed(Date.now() + delayMs, job.token)
      throw new DelayedError()
    }

    // 1. Load message — exige approved_by_admin=true
    const { data: msg, error: msgErr } = await supabase
      .from('outbound_messages')
      .select('id, lead_cnpj, to_address, message_body, status, channel, approved_by_admin')
      .eq('id', outboundMessageId)
      .single()
    if (msgErr || !msg) {
      log.warn({ err: msgErr?.message }, 'Message not found')
      throw new UnrecoverableError('outbound_message not found')
    }
    if (msg.status !== 'queued') {
      log.info({ status: msg.status }, 'Not in queued state — skipping')
      return { skipped: true, reason: 'not_queued', status: msg.status }
    }
    if (!msg.approved_by_admin) {
      log.info('Not approved by admin — deferring 5min')
      await job.moveToDelayed(Date.now() + 5 * 60_000, job.token)
      throw new DelayedError()
    }

    // 2. Opt-out double-check
    const { data: opt } = await supabase
      .from('outbound_optouts')
      .select('id')
      .or(`cnpj.eq.${msg.lead_cnpj},whatsapp.eq.${msg.to_address}`)
      .limit(1)
    if (opt && opt.length > 0) {
      await supabase
        .from('outbound_messages')
        .update({ status: 'opted_out', failed_at: new Date().toISOString() })
        .eq('id', outboundMessageId)
      log.info('Opted-out at send time — aborting')
      return { skipped: true, reason: 'opted_out' }
    }

    // 3. Outbound session connectivity check
    const connected = await isOutboundSessionConnected()
    if (!connected) {
      log.warn({ session: WAHA_OUTBOUND_SESSION }, 'WAHA outbound session not WORKING — will retry')
      throw new Error('WAHA outbound session not WORKING')
    }

    // 4. Mark sending
    await supabase
      .from('outbound_messages')
      .update({ status: 'sending' })
      .eq('id', outboundMessageId)

    // 5. Send (test-mode redirect if WHATSAPP_TEST_PHONE set)
    const finalPhone = TEST_PHONE || msg.to_address
    if (TEST_PHONE) {
      log.warn({ realTarget: '***' + msg.to_address.slice(-4) }, 'TEST_PHONE ativo — redirecionando')
    }

    try {
      const result = (await sendOutboundText(finalPhone, msg.message_body)) as {
        id?: string
        messageId?: string
        key?: { id?: string }
      } | undefined
      const externalId = result?.id || result?.messageId || result?.key?.id || null

      await supabase
        .from('outbound_messages')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          external_id: externalId,
          metadata: TEST_PHONE
            ? { test_redirect: true, real_target_last4: msg.to_address.slice(-4) }
            : undefined,
        })
        .eq('id', outboundMessageId)

      log.info({ to: finalPhone.slice(-4), externalId, sentToday: sentToday + 1, cap: DAILY_CAP }, 'Sent')
      return { sent: true, externalId }
    } catch (err) {
      const message = (err as Error).message || ''
      // Permanent: bad number, banned, unauthorized, not on whatsapp
      const permanent =
        /\b40[01]\b|\b403\b|\b404\b|number_invalid|not.*on.*whatsapp|banned|blocked/i.test(message)

      await supabase
        .from('outbound_messages')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          error_message: message.slice(0, 500),
        })
        .eq('id', outboundMessageId)

      if (permanent) {
        throw new UnrecoverableError(`WhatsApp permanent: ${message.slice(0, 200)}`)
      }
      // Transient — revert to queued
      await supabase
        .from('outbound_messages')
        .update({ status: 'queued', failed_at: null })
        .eq('id', outboundMessageId)
      throw err
    }
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 120_000,
    limiter: {
      // 1 msg/min máximo no nível do worker. Combinado com daily cap (15)
      // e quiet hours, isso resulta em throughput natural de ~9h * 1/min
      // mas o cap diário corta antes — efetivo ~15 msgs spread em 9h.
      max: 1,
      duration: 60_000,
    },
  },
)

outboundWhatsappWorker.on('failed', (job, err) => {
  const attempt = job?.attemptsMade ?? 0
  const maxAttempts = job?.opts?.attempts ?? 4
  logger.error(
    { jobId: job?.id, attempt, maxAttempts, err: err.message },
    attempt >= maxAttempts ? 'Outbound WhatsApp permanently failed' : 'Outbound WhatsApp failed, will retry',
  )
})

export { outboundWhatsappWorker }
