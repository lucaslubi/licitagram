/**
 * Webhook fan-out. Given a company_id + event_kind + payload, finds every
 * enabled bot_webhook matching the kind filter and inserts a
 * bot_webhook_deliveries row + enqueues a delivery job.
 *
 * Best-effort: never throws to the caller. The runner emits events every
 * tick and we MUST NOT let a misconfigured webhook break the bidding
 * loop. Errors are logged and swallowed.
 */

import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { enqueueWebhookDelivery } from '../queues/bot-webhook-delivery.queue'

export async function fanoutEvent(
  companyId: string,
  sessionId: string,
  eventKind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const { data: webhooks } = await supabase
      .from('bot_webhooks')
      .select('id, event_kinds')
      .eq('company_id', companyId)
      .eq('enabled', true)

    if (!webhooks || webhooks.length === 0) return

    for (const wh of webhooks) {
      // Filter: empty event_kinds means "all".
      const kinds = (wh.event_kinds as string[] | null) ?? []
      if (kinds.length > 0 && !kinds.includes(eventKind)) continue

      const { data: delivery, error } = await supabase
        .from('bot_webhook_deliveries')
        .insert({
          webhook_id: wh.id,
          company_id: companyId,
          session_id: sessionId,
          event_kind: eventKind,
          payload,
        })
        .select('id')
        .single()

      if (error || !delivery) {
        logger.warn(
          { companyId, webhookId: wh.id, err: error?.message },
          '[webhook-fanout] failed to insert delivery row',
        )
        continue
      }

      try {
        await enqueueWebhookDelivery(delivery.id)
      } catch (err) {
        logger.warn(
          { deliveryId: delivery.id, err: err instanceof Error ? err.message : err },
          '[webhook-fanout] failed to enqueue delivery',
        )
      }
    }
  } catch (err) {
    logger.warn(
      { companyId, err: err instanceof Error ? err.message : err },
      '[webhook-fanout] unexpected error — swallowing',
    )
  }
}
