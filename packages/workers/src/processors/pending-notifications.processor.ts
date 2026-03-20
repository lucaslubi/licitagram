import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { notificationQueue } from '../queues/notification.queue'
import { whatsappQueue } from '../queues/notification-whatsapp.queue'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { purgeNonCompetitiveMatches } from '../lib/notification-guard'

// ─── Priority levels for BullMQ (lower number = higher priority) ────────
// Fresh matches (< 2h old) get processed first
const PRIORITY_FRESH = 1   // < 2 hours old
const PRIORITY_RECENT = 3  // < 12 hours old
const PRIORITY_NORMAL = 5  // < 48 hours old
const PRIORITY_BACKLOG = 8 // older than 48h

function getJobPriority(createdAt: string | null): number {
  if (!createdAt) return PRIORITY_NORMAL
  const ageMs = Date.now() - new Date(createdAt).getTime()
  const ageHours = ageMs / (60 * 60 * 1000)
  if (ageHours < 2) return PRIORITY_FRESH
  if (ageHours < 12) return PRIORITY_RECENT
  if (ageHours < 48) return PRIORITY_NORMAL
  return PRIORITY_BACKLOG
}

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
  enterprise: 5,
  pro: 3,
  trial: 2,
  free: 1,
}

/**
 * When backlog is large (> 50 pending), use higher batch sizes
 * to drain faster without spamming (still one batch per 5min cycle).
 */
const BACKLOG_BATCH_BY_PLAN: Record<string, number> = {
  enterprise: 15,
  pro: 10,
  trial: 5,
  free: 2,
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

    // ── STARTUP PURGE: clean non-competitive matches that slipped through ──
    // This runs on every cycle but is fast (indexed query) and self-healing
    try {
      const purged = await purgeNonCompetitiveMatches()
      if (purged > 0) {
        logger.info({ purged }, 'Purged non-competitive matches before notification cycle')
      }
    } catch (purgeErr) {
      logger.warn({ err: purgeErr }, 'Purge non-competitive matches failed (non-critical)')
    }

    // Find users with any notification channel linked
    // Query only columns guaranteed to exist; whatsapp_verified may not exist yet
    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('id, company_id, telegram_chat_id, whatsapp_number, whatsapp_verified, min_score, notification_preferences')
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
    const today = now.toISOString().split('T')[0]

    // ── Batch sentToday count for ALL companies at once (avoids N+1) ──
    // Supabase doesn't support GROUP BY in PostgREST, so we fetch a limited
    // set of (company_id, notified_at) rows from today and aggregate in-memory.
    const sentTodayByCompany = new Map<string, number>()
    const { data: notifiedRows } = await supabase
      .from('matches')
      .select('company_id')
      .in('company_id', companyIds)
      .gte('notified_at', `${today}T00:00:00`)
      .limit(5000)

    for (const row of notifiedRows || []) {
      sentTodayByCompany.set(row.company_id, (sentTodayByCompany.get(row.company_id) || 0) + 1)
    }

    let totalEnqueued = 0

    for (const user of users) {
      const prefs = (user.notification_preferences as Record<string, boolean>) || {}
      const hasTelegram = user.telegram_chat_id && prefs.telegram !== false
      const hasWhatsApp = user.whatsapp_number && user.whatsapp_verified && prefs.whatsapp !== false

      // Skip if no channel available
      if (!hasTelegram && !hasWhatsApp) continue

      const plan = planByCompany.get(user.company_id) || 'free'
      const batchSize = BATCH_BY_PLAN[plan] || 1
      const minDaily = MIN_DAILY_BY_PLAN[plan] || 1
      const minScore = user.min_score ?? 50

      // Find matches for this user's company that are 'new' (not yet notified)
      // ONLY notify AI-verified matches — keyword-only matches are unreliable
      const { data: pendingMatches } = await supabase
        .from('matches')
        .select('id, score, match_source, created_at, tenders(data_encerramento, modalidade_id)')
        .eq('company_id', user.company_id)
        .eq('status', 'new')
        .gte('score', minScore)
        .in('match_source', ['ai', 'ai_triage', 'semantic'])
        .is('notified_at', null)
        .order('created_at', { ascending: false })  // Newest first!
        .limit(MAX_NOTIFICATIONS_PER_USER)

      if (!pendingMatches || pendingMatches.length === 0) continue

      // Filter out expired tenders AND non-competitive modalities in code
      // Inexigibilidade (9), Credenciamento (12), Inaplicabilidade (14) — impossible to bid competitively
      const EXCLUDED_MODS = new Set([9, 12, 14])
      const validMatches = pendingMatches.filter((m: any) => {
        const mod = m.tenders?.modalidade_id
        if (mod && EXCLUDED_MODS.has(mod)) return false
        const enc = m.tenders?.data_encerramento
        if (!enc) return true // No deadline = still valid
        return enc >= today
      })

      if (validMatches.length === 0) continue

      const alreadySent = sentTodayByCompany.get(user.company_id) || 0

      // Determine batch size for this cycle
      // Use larger batch when there's a significant backlog to drain faster
      const backlogBatch = BACKLOG_BATCH_BY_PLAN[plan] || 5
      let cycleBatch = validMatches.length > 50 ? backlogBatch : batchSize

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
          const priority = getJobPriority((match as any).created_at)

          // Enqueue Telegram (independent queue)
          // jobId prevents duplicate sends across pending-check cycles
          // priority ensures fresh matches are processed before old backlog
          if (hasTelegram) {
            await notificationQueue.add(
              `tg-${user.id}-${match.id}`,
              {
                matchId: match.id,
                telegramChatId: user.telegram_chat_id,
              },
              {
                jobId: `tg-${user.id}-${match.id}`,
                priority,
                attempts: 3,
                backoff: { type: 'exponential', delay: 3000 },
              },
            )
          }

          // Enqueue WhatsApp (independent queue — separate worker, no blocking)
          // jobId prevents duplicate sends across pending-check cycles
          if (hasWhatsApp) {
            await whatsappQueue.add(
              `wa-${user.id}-${match.id}`,
              {
                matchId: match.id,
                whatsappNumber: user.whatsapp_number,
              },
              {
                jobId: `wa-${user.id}-${match.id}`,
                priority,
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
