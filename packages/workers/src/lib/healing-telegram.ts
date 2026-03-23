/**
 * Telegram helpers for the AI Healing System.
 *
 * Sends alerts, approval requests, and reports to the admin via Telegram.
 * Uses the raw Telegram Bot API (fetch) to avoid coupling with grammy bot instance.
 */
import { logger } from './logger'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || ''

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`

function isConfigured(): boolean {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
    logger.warn('Healing Telegram: BOT_TOKEN or ADMIN_CHAT_ID not configured')
    return false
  }
  return true
}

/**
 * Send a healing alert to the admin.
 * If requiresApproval is true, includes inline keyboard with Aprovar/Rejeitar buttons.
 */
export async function sendHealingAlert(
  message: string,
  actionId: number,
  requiresApproval: boolean,
): Promise<string | null> {
  if (!isConfigured()) return null

  const body: Record<string, unknown> = {
    chat_id: ADMIN_CHAT_ID,
    text: message,
    parse_mode: 'HTML',
  }

  if (requiresApproval) {
    body.reply_markup = {
      inline_keyboard: [
        [
          { text: '✅ Aprovar', callback_data: `healing_approve_${actionId}` },
          { text: '❌ Rejeitar', callback_data: `healing_reject_${actionId}` },
        ],
      ],
    }
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as { ok: boolean; result?: { message_id: number } }
    if (data.ok && data.result) {
      return String(data.result.message_id)
    }
    logger.warn({ data }, 'Healing Telegram: sendMessage failed')
    return null
  } catch (err) {
    logger.error({ err }, 'Healing Telegram: sendMessage exception')
    return null
  }
}

/**
 * Send the daily healing report to the admin.
 */
export async function sendHealingReport(report: string): Promise<void> {
  if (!isConfigured()) return

  // Telegram has a 4096 char limit per message — split if needed
  const MAX_LEN = 4000
  const chunks: string[] = []
  let remaining = report
  while (remaining.length > 0) {
    if (remaining.length <= MAX_LEN) {
      chunks.push(remaining)
      break
    }
    // Try to split at a newline boundary
    const splitIdx = remaining.lastIndexOf('\n', MAX_LEN)
    const cutAt = splitIdx > MAX_LEN * 0.5 ? splitIdx : MAX_LEN
    chunks.push(remaining.slice(0, cutAt))
    remaining = remaining.slice(cutAt)
  }

  for (const chunk of chunks) {
    try {
      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ADMIN_CHAT_ID,
          text: chunk,
          parse_mode: 'HTML',
        }),
      })
    } catch (err) {
      logger.error({ err }, 'Healing Telegram: sendReport chunk failed')
    }
  }
}