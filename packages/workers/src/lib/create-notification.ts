/**
 * Helper to insert notifications into the unified notifications table.
 * Called by all notification processors after sending Telegram/WhatsApp/Email.
 */

import { db as supabase } from './db'
import { logger } from './logger'

interface CreateNotificationParams {
  userId: string
  companyId: string
  type: 'new_match' | 'hot_match' | 'urgency' | 'certidao_expiring' | 'certidao_expired' | 'proposal_generated' | 'outcome_prompt' | 'bot_session_completed' | 'impugnation_deadline' | 'weekly_report' | 'system'
  title: string
  body: string
  link?: string
  metadata?: Record<string, unknown>
}

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    await supabase.supabase
      .from('notifications')
      .insert({
        user_id: params.userId,
        company_id: params.companyId,
        type: params.type,
        title: params.title,
        body: params.body,
        link: params.link || null,
        metadata: params.metadata || {},
        read: false,
      })
  } catch (err: any) {
    logger.warn({ err: err.message, type: params.type }, 'Failed to create notification (non-blocking)')
  }
}
