import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { notificationQueue } from '../queues/notification.queue'
import { whatsappQueue } from '../queues/notification-whatsapp.queue'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

/**
 * Batch size per cycle by plan tier.
 * The pending check runs every 5 min (288x/day).
 * We spread notifications by sending small batches, not dumping all at once.
 *
 * Enterprise: 3 per cycle → with new matches arriving throughout the day,
 *   ensures 5+ distinct notification "moments" per day.
 * Pro: 2 per cycle → ensures 3+ moments per day.
 * Trial/Free: 1 per cycle → light touch.
 */
const BATCH_BY_PLAN: Record<string, number> = {
  enterprise: 3,
  pro: 2,
  trial: 1,
  free: 1,
}

/**
 * Minimum daily notifications target by plan.
 * If we haven't hit this by 6PM (UTC-3 = 21h UTC), we send a larger batch
 * to make sure the client gets their minimum.
 */
const MIN_DAILY_BY_PLAN: Record<string, number> = {
  enterprise: 5,
  pro: 3,
  trial: 1,
  free: 1,
}

const MAX_NOTIFICATIONS_PER_USER = 50

/**
 * Pending notifications processor
 * Runs every 5 minutes to find matches that haven't been notified yet
 * and sends them to users who have Telegram linked.
 * Respects plan tier for notification frequency.
 */
const pendingNotificationsWorker = new Worker(
  'pending-notifications',
  async () => {
    logger.info('Checking for pending notifications...')

    // Find users with any notification channel linked
    // Query only columns guaranteed to exist; whatsapp_verified may not exist yet
    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('id, company_id, telegram_chat_id, whatsapp_number, min_score, notification_preferences')
      .not('company_id', 'is', null)

    if (usersErr) {
      logger.error({ err: usersErr }, 'Failed to fetch users for notifications')
      return
    }

    if (!users || users.length === 0) {
      logger.info('No users with notification channels, skipping')
      return
    }

    // Get subscriptions for all companies to know their plan
    const companyIds = [...new Set(users.map((u) => u.company_id).filter(Boolean))]
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('company_id, plan, status')
      .in('company_id', companyIds)
      .in('status', ['active', 'trialing'])

    const planByCompany = new Map<string, string>()
    for (const sub of subs || []) {
      planByCompany.set(sub.company_id, sub.plan)
    }

    const now = new Date()
    const currentHourUTC = now.getUTCHours()
    // Brazil is UTC-3, so 18h BRT = 21h UTC
    const isLateDay = currentHourUTC >= 21

    let totalEnqueued = 0

    for (const user of users) {
      const prefs = (user.notification_preferences as Record<string, boolean>) || {}
      const hasTelegram = user.telegram_chat_id && prefs.telegram !== false
      const hasWhatsApp = user.whatsapp_number && (user as any).whatsapp_verified && prefs.whatsapp !== false

      // Skip if no channel available
      if (!hasTelegram && !hasWhatsApp) continue

      const plan = planByCompany.get(user.company_id) || 'free'
      const batchSize = BATCH_BY_PLAN[plan] || 1
      const minDaily = MIN_DAILY_BY_PLAN[plan] || 1
      const minScore = user.min_score ?? 50

      // Find matches for this user's company that are 'new' (not yet notified)
      const today = new Date().toISOString().split('T')[0]
      // ONLY notify AI-verified matches — keyword-only matches are unreliable
      // Don't filter by modalidade — if AI scored it high, it's relevant
      const { data: pendingMatches } = await supabase
        .from('matches')
        .select('id, score, match_source, tenders(data_encerramento)')
        .eq('company_id', user.company_id)
        .eq('status', 'new')
        .gte('score', minScore)
        .in('match_source', ['ai', 'ai_triage', 'semantic'])
        .is('notified_at', null)
        .order('score', { ascending: false })
        .limit(MAX_NOTIFICATIONS_PER_USER)

      if (!pendingMatches || pendingMatches.length === 0) continue

      // Filter out expired tenders in code (since we removed !inner join)
      const validMatches = pendingMatches.filter((m: any) => {
        const enc = m.tenders?.data_encerramento
        if (!enc) return true // No deadline = still valid
        return enc >= today
      })

      if (validMatches.length === 0) continue

      // Count how many were already sent today
      const { count: sentToday } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', user.company_id)
        .gte('notified_at', `${today}T00:00:00`)

      const alreadySent = sentToday || 0

      // Determine batch size for this cycle
      let cycleBatch = batchSize

      // Late in the day and haven't hit minimum? Send a bigger batch
      if (isLateDay && alreadySent < minDaily) {
        cycleBatch = Math.max(cycleBatch, minDaily - alreadySent)
      }

      const batch = validMatches.slice(0, cycleBatch)

      logger.info(
        {
          userId: user.id,
          plan,
          pendingCount: validMatches.length,
          sentToday: alreadySent,
          sending: batch.length,
          minDaily,
        },
        'Found pending matches for user',
      )

      for (const match of batch) {
        try {
          // Enqueue Telegram (independent queue)
          if (hasTelegram) {
            await notificationQueue.add(
              `tg-${user.id}-${match.id}`,
              {
                matchId: match.id,
                telegramChatId: user.telegram_chat_id,
              },
              {
                attempts: 3,
                backoff: { type: 'exponential', delay: 3000 },
              },
            )
          }

          // Enqueue WhatsApp (independent queue — separate worker, no blocking)
          if (hasWhatsApp) {
            await whatsappQueue.add(
              `wa-${user.id}-${match.id}`,
              {
                matchId: match.id,
                whatsappNumber: user.whatsapp_number,
              },
              {
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
              },
            )
          }

          totalEnqueued++
        } catch (enqueueErr) {
          logger.debug({ matchId: match.id, err: enqueueErr }, 'Skipped notification job')
        }
      }
    }

    logger.info({ totalEnqueued }, 'Pending notifications check complete')
  },
  {
    connection,
    concurrency: 1,
  },
)

pendingNotificationsWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Pending notifications job failed')
})

export { pendingNotificationsWorker }
