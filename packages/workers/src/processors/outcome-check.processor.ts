import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { notificationQueue } from '../queues/notification.queue'
import { whatsappQueue } from '../queues/notification-whatsapp.queue'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

/** Maximum outcome prompts per user per cycle */
const MAX_PROMPTS_PER_USER = 3

/**
 * Outcome check processor
 * Runs every 6 hours to find tenders that have closed and prompts
 * users to report their bid outcomes (won / lost / didn't bid).
 *
 * Only considers matches where:
 * - tender closed between 6 hours and 30 days ago
 * - match status is 'notified', 'viewed', 'interested', or 'applied'
 * - no bid_outcome record exists for that match
 */
const outcomeCheckWorker = new Worker(
  'outcome-prompt',
  async () => {
    logger.info('Checking for closed tenders pending outcome reports...')

    // Find users with any notification channel linked
    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('id, company_id, telegram_chat_id, whatsapp_number, whatsapp_verified, notification_preferences')
      .not('company_id', 'is', null)

    if (usersErr) {
      logger.error({ err: usersErr }, 'Failed to fetch users for outcome check')
      return
    }

    if (!users || users.length === 0) {
      logger.info('No users with notification channels, skipping outcome check')
      return
    }

    const now = new Date()
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

    let totalEnqueued = 0

    for (const user of users) {
      const prefs = (user.notification_preferences as Record<string, boolean>) || {}
      const hasTelegram = user.telegram_chat_id && prefs.telegram !== false
      const hasWhatsApp = user.whatsapp_number && user.whatsapp_verified && prefs.whatsapp !== false

      // Skip if no channel available
      if (!hasTelegram && !hasWhatsApp) continue

      // Find matches for this user's company where the tender has closed
      // and the user engaged (notified/viewed/interested/applied) but hasn't reported outcome
      const { data: matches, error: matchErr } = await supabase
        .from('matches')
        .select('id, tender_id, tenders(objeto, orgao_nome, data_encerramento)')
        .eq('company_id', user.company_id)
        .in('status', ['notified', 'viewed', 'interested', 'applied'])
        .order('created_at', { ascending: false })
        .limit(50)

      if (matchErr) {
        logger.error({ userId: user.id, err: matchErr }, 'Failed to fetch matches for outcome check')
        continue
      }

      if (!matches || matches.length === 0) continue

      // Filter to tenders that closed between 6 hours and 30 days ago
      const closedMatches = matches.filter((m: any) => {
        const enc = m.tenders?.data_encerramento
        if (!enc) return false
        return enc <= sixHoursAgo && enc >= thirtyDaysAgo
      })

      if (closedMatches.length === 0) continue

      // Check which matches already have a bid_outcome record
      const matchIds = closedMatches.map((m: any) => m.id)
      const { data: existingOutcomes } = await supabase
        .from('bid_outcomes')
        .select('match_id')
        .in('match_id', matchIds)

      const outcomeMatchIds = new Set((existingOutcomes || []).map((o: any) => o.match_id))
      const pendingOutcomes = closedMatches.filter((m: any) => !outcomeMatchIds.has(m.id))

      if (pendingOutcomes.length === 0) continue

      // Take up to MAX_PROMPTS_PER_USER
      const batch = pendingOutcomes.slice(0, MAX_PROMPTS_PER_USER)

      logger.info(
        {
          userId: user.id,
          pendingCount: pendingOutcomes.length,
          sending: batch.length,
        },
        'Found closed tenders pending outcome report',
      )

      for (const match of batch) {
        const tender = (match as any).tenders || {}
        const closeDate = new Date(tender.data_encerramento)
        const daysSinceClose = Math.floor((now.getTime() - closeDate.getTime()) / (1000 * 60 * 60 * 24))

        try {
          // Enqueue Telegram notification
          if (hasTelegram) {
            await notificationQueue.add(
              `outcome-tg-${user.id}-${match.id}`,
              {
                type: 'outcome_prompt' as const,
                matchId: match.id,
                telegramChatId: user.telegram_chat_id,
                tenderObjeto: tender.objeto || '',
                tenderOrgao: tender.orgao_nome || '',
                daysSinceClose,
              },
              {
                jobId: `outcome-tg-${user.id}-${match.id}`,
                attempts: 3,
                backoff: { type: 'exponential', delay: 3000 },
              },
            )
          }

          // Enqueue WhatsApp notification
          if (hasWhatsApp) {
            await whatsappQueue.add(
              `outcome-wa-${user.id}-${match.id}`,
              {
                type: 'outcome_prompt' as const,
                matchId: match.id,
                whatsappNumber: user.whatsapp_number,
                tenderObjeto: tender.objeto || '',
                tenderOrgao: tender.orgao_nome || '',
                daysSinceClose,
              },
              {
                jobId: `outcome-wa-${user.id}-${match.id}`,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
              },
            )
          }

          totalEnqueued++
        } catch (enqueueErr) {
          logger.debug({ matchId: match.id, err: enqueueErr }, 'Skipped outcome prompt job')
        }
      }
    }

    logger.info({ totalEnqueued }, 'Outcome check complete')
  },
  {
    connection,
    concurrency: 1,
  },
)

outcomeCheckWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Outcome check job failed')
})

export { outcomeCheckWorker }
