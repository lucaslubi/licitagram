import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { notificationQueue } from '../queues/notification.queue'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

const MAX_NOTIFICATIONS_PER_USER = 50

/**
 * Pending notifications processor
 * Runs every 30 minutes to find matches that haven't been notified yet
 * and sends them to users who have Telegram linked
 */
const pendingNotificationsWorker = new Worker(
  'pending-notifications',
  async () => {
    logger.info('Checking for pending notifications...')

    // Find users with any notification channel linked
    const { data: users } = await supabase
      .from('users')
      .select('id, company_id, telegram_chat_id, whatsapp_number, min_score, notification_preferences')
      .not('company_id', 'is', null)

    if (!users || users.length === 0) {
      logger.info('No users with notification channels, skipping')
      return
    }

    let totalEnqueued = 0

    for (const user of users) {
      const prefs = (user.notification_preferences as Record<string, boolean>) || {}
      const hasTelegram = user.telegram_chat_id && prefs.telegram !== false
      const hasWhatsApp = user.whatsapp_number && prefs.whatsapp !== false

      // Skip if no channel available
      if (!hasTelegram && !hasWhatsApp) continue

      const minScore = user.min_score ?? 60

      // Find matches for this user's company that are 'new' (not yet notified)
      // Only notify about competitive, non-expired tenders
      const today = new Date().toISOString().split('T')[0]
      // ONLY notify AI-verified matches — keyword-only matches are unreliable
      const { data: pendingMatches } = await supabase
        .from('matches')
        .select('id, score, match_source, tenders!inner(data_encerramento, modalidade_id)')
        .eq('company_id', user.company_id)
        .eq('status', 'new')
        .gte('score', minScore)
        .in('match_source', ['ai', 'ai_triage', 'semantic'])
        .is('notified_at', null)
        .not('tenders.modalidade_id', 'in', '(9,14)')
        .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
        .order('score', { ascending: false })
        .limit(MAX_NOTIFICATIONS_PER_USER)

      if (!pendingMatches || pendingMatches.length === 0) continue

      logger.info(
        { userId: user.id, pendingCount: pendingMatches.length },
        'Found pending matches for user',
      )

      for (const match of pendingMatches) {
        try {
          // Use time-bucketed jobId (1h window) to allow retries of failed jobs
          // while still preventing rapid duplicates within the same hour
          const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000))
          await notificationQueue.add(
            `pending-notify-${user.id}-${match.id}`,
            {
              matchId: match.id,
              telegramChatId: hasTelegram ? user.telegram_chat_id : undefined,
              whatsappNumber: hasWhatsApp ? user.whatsapp_number : undefined,
            },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 3000 },
              // Deduplicate within 1-hour window; allows retry in next hour
              jobId: `pending-${user.id}-${match.id}-${hourBucket}`,
            },
          )
          totalEnqueued++
        } catch (enqueueErr) {
          // Likely duplicate jobId — safe to ignore
          logger.debug({ matchId: match.id, err: enqueueErr }, 'Skipped duplicate notification job')
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
