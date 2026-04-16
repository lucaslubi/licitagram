/**
 * Bot Webhook Delivery Processor
 *
 * Takes a bot_webhook_deliveries row, resolves the target webhook's URL
 * + secret, signs the payload with HMAC-SHA256, and POSTs it.
 *
 * Signature spec (documented in README for customers):
 *
 *   X-Licitagram-Event:         <event_kind>
 *   X-Licitagram-Delivery:      <delivery_id>
 *   X-Licitagram-Timestamp:     <unix_ms>
 *   X-Licitagram-Signature-256: sha256=<hex>
 *
 * where <hex> = HMAC_SHA256(secret, `${timestamp}.${body}`). This matches
 * Stripe's pattern so any existing integration helper Just Works.
 *
 * Retry on any 5xx or network error. Permanently fail on 4xx except 408
 * and 429 (which retry).
 */

import { Worker, UnrecoverableError } from 'bullmq'
import * as crypto from 'node:crypto'
import { connection } from '../../queues/connection'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { decryptSecret } from '../lib/crypto'
import {
  QUEUE_NAME,
  type WebhookDeliveryJobData,
} from '../queues/bot-webhook-delivery.queue'

const TIMEOUT_MS = 10_000

function shouldRetry(status: number | null): boolean {
  if (status === null) return true
  if (status >= 500) return true
  if (status === 408 || status === 429) return true
  return false
}

export const botWebhookDeliveryWorker = new Worker<WebhookDeliveryJobData>(
  QUEUE_NAME,
  async (job) => {
    const { deliveryId } = job.data
    const log = logger.child({ jobId: job.id, deliveryId })

    const { data: delivery, error: delErr } = await supabase
      .from('bot_webhook_deliveries')
      .select('id, webhook_id, company_id, session_id, event_kind, payload, attempt_count, delivered_at')
      .eq('id', deliveryId)
      .single()

    if (delErr || !delivery) {
      log.warn({ err: delErr?.message }, 'delivery not found')
      return { skipped: 'not_found' }
    }
    if (delivery.delivered_at) {
      return { skipped: 'already_delivered' }
    }

    const { data: webhook, error: whErr } = await supabase
      .from('bot_webhooks')
      .select('id, url, enabled, secret_cipher, secret_nonce, event_kinds')
      .eq('id', delivery.webhook_id)
      .single()

    if (whErr || !webhook) {
      log.warn({ err: whErr?.message }, 'webhook not found — marking delivery failed')
      await supabase
        .from('bot_webhook_deliveries')
        .update({
          last_status_code: null,
          last_response_snippet: 'webhook_deleted',
          last_attempt_at: new Date().toISOString(),
          next_retry_at: null,
        })
        .eq('id', deliveryId)
      throw new UnrecoverableError('webhook deleted')
    }
    if (!webhook.enabled) {
      log.info('webhook disabled — dropping delivery')
      await supabase
        .from('bot_webhook_deliveries')
        .update({
          last_status_code: null,
          last_response_snippet: 'webhook_disabled',
          last_attempt_at: new Date().toISOString(),
          next_retry_at: null,
        })
        .eq('id', deliveryId)
      return { skipped: 'disabled' }
    }
    if (webhook.event_kinds && webhook.event_kinds.length > 0 && !webhook.event_kinds.includes(delivery.event_kind)) {
      log.info('event kind filtered out by webhook — dropping')
      await supabase
        .from('bot_webhook_deliveries')
        .update({
          last_status_code: null,
          last_response_snippet: 'event_kind_filtered',
          last_attempt_at: new Date().toISOString(),
          next_retry_at: null,
        })
        .eq('id', deliveryId)
      return { skipped: 'filtered' }
    }

    // Validate URL scheme — HTTPS only.
    let targetUrl: URL
    try {
      targetUrl = new URL(webhook.url)
      if (targetUrl.protocol !== 'https:') {
        throw new Error('non_https')
      }
    } catch {
      throw new UnrecoverableError('webhook_url_invalid')
    }

    // Decrypt HMAC secret.
    let secret: string
    try {
      secret = decryptSecret(
        Buffer.from(webhook.secret_cipher),
        Buffer.from(webhook.secret_nonce),
      )
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : err }, 'failed to decrypt webhook secret')
      throw new UnrecoverableError('secret_decrypt_failed')
    }

    const body = JSON.stringify({
      id: delivery.id,
      event_kind: delivery.event_kind,
      session_id: delivery.session_id,
      occurred_at: new Date().toISOString(),
      payload: delivery.payload,
    })
    const timestampMs = Date.now()
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${timestampMs}.${body}`)
      .digest('hex')

    // POST with a 10s timeout.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let status: number | null = null
    let snippet = ''
    try {
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Licitagram-Event': delivery.event_kind,
          'X-Licitagram-Delivery': delivery.id,
          'X-Licitagram-Timestamp': String(timestampMs),
          'X-Licitagram-Signature-256': `sha256=${signature}`,
          'User-Agent': 'Licitagram-Webhook/1.0',
        },
        body,
        signal: controller.signal,
      })
      status = res.status
      snippet = (await res.text()).slice(0, 500)
    } catch (err) {
      snippet = err instanceof Error ? err.message.slice(0, 500) : 'network_error'
    } finally {
      clearTimeout(timer)
    }

    const nextAttemptCount = (delivery.attempt_count ?? 0) + 1
    const delivered = status !== null && status >= 200 && status < 300
    const retryable = !delivered && shouldRetry(status)
    const maxAttempts = job.opts.attempts ?? 6

    const update: Record<string, unknown> = {
      attempt_count: nextAttemptCount,
      last_status_code: status,
      last_response_snippet: snippet,
      last_attempt_at: new Date().toISOString(),
    }
    if (delivered) {
      update.delivered_at = new Date().toISOString()
      update.next_retry_at = null
    } else if (retryable && nextAttemptCount < maxAttempts) {
      // BullMQ schedules the actual retry; we just stamp the expected time
      // so the UI can show it.
      const delaySec = Math.min(3600, 30 * 2 ** (nextAttemptCount - 1))
      update.next_retry_at = new Date(Date.now() + delaySec * 1000).toISOString()
    } else {
      update.next_retry_at = null
    }

    await supabase.from('bot_webhook_deliveries').update(update).eq('id', delivery.id)

    if (!delivered) {
      log.warn({ status, snippet, nextAttemptCount }, 'webhook delivery failed')
      if (retryable && nextAttemptCount < maxAttempts) {
        throw new Error(`delivery_failed status=${status}`) // BullMQ will retry
      }
      throw new UnrecoverableError(`delivery_failed_permanent status=${status}`)
    }

    log.info({ status, attempt: nextAttemptCount }, 'webhook delivered')
    return { delivered: true, status }
  },
  {
    connection,
    concurrency: 10,
  },
)

botWebhookDeliveryWorker.on('failed', (job, err) => {
  logger.error(
    {
      jobId: job?.id,
      deliveryId: job?.data.deliveryId,
      attempts: job?.attemptsMade,
      err: err.message,
    },
    '[bot-webhook-delivery] job failed',
  )
})
