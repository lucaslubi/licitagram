/**
 * Bot Webhook Delivery Queue
 *
 * The Supreme Bot public API lets enterprise customers subscribe to event
 * webhooks. When the runner writes a bot_events row, a lightweight
 * fan-out emits one delivery job per matching bot_webhooks row.
 *
 * Jobs carry { deliveryId } only; the processor re-reads the delivery
 * payload to get the current retry count + URL. Exponential backoff via
 * BullMQ built-ins, capped at 6 attempts.
 */

import { Queue } from 'bullmq'
import { connection } from '../../queues/connection'

export const QUEUE_NAME = 'bot-webhook-delivery'

export interface WebhookDeliveryJobData {
  deliveryId: string
}

export const botWebhookDeliveryQueue = new Queue<WebhookDeliveryJobData>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 6,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { count: 1000, age: 7 * 24 * 3600 },
    removeOnFail: { count: 2000, age: 30 * 24 * 3600 },
  },
})

export async function enqueueWebhookDelivery(deliveryId: string, delayMs = 0): Promise<void> {
  await botWebhookDeliveryQueue.add(
    'deliver',
    { deliveryId },
    { jobId: `delivery-${deliveryId}`, delay: delayMs },
  )
}
