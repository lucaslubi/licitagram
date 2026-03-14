import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { notificationQueue } from '../queues/notification.queue'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

const MAX_NOTIFICATIONS_PER_USER = 10

/**
 * Pending notifications processor
 * Runs every 30 minutes to find matches that haven't been notified yet
 * and sends them to users who have Telegram linked
 */
const pendingNotificationsWorker = new Worker(
  'pending-notifications',
  async () => {
    logger.info('Checking for pending notifications...')

    // Find users with Telegram linked
    const { data: users } = await supabase
      .from('users')
      .select('id, company_id, telegram_chat_id, min_score, notification_preferences')
      .not('telegram_chat_id', 'is', null)
      .not('company_id', 'is', null)

    if (!users || users.length === 0) {
      logger.info('No users with Telegram linked, skipping')
      return
    }

    let totalEnqueued = 0

    for (const user of users) {
      // Check if user has Telegram notifications enabled (default: true)
      const prefs = (user.notification_preferences as Record<string, boolean>) || {}
      if (prefs.telegram === false) {
        continue
      }

      const minScore = user.min_score ?? 60

      // Find matches for this user's company that are 'new' (not yet notified)
      const { data: pendingMatches } = await supabase
        .from('matches')
        .select('id, score')
        .eq('company_id', user.company_id)
        .eq('status', 'new')
        .gte('score', minScore)
        .is('notified_at', null)
        .order('score', { ascending: false })
        .limit(MAX_NOTIFICATIONS_PER_USER)

      if (!pendingMatches || pendingMatches.length === 0) continue

      logger.info(
        { userId: user.id, pendingCount: pendingMatches.length },
        'Found pending matches for user',
      )

      for (const match of pendingMatches) {
        await notificationQueue.add(
          `pending-notify-${user.id}-${match.id}`,
          {
            matchId: match.id,
            telegramChatId: user.telegram_chat_id,
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 3000 },
            // Deduplicate: don't send the same notification twice
            jobId: `pending-${user.id}-${match.id}`,
          },
        )
        totalEnqueued++
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
