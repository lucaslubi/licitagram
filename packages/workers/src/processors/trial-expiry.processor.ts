/**
 * Trial Expiry Processor
 *
 * Runs daily to expire trial subscriptions that have passed their `expires_at` date.
 * Only affects local trials (plan = 'trial', no Stripe subscription).
 * Stripe-managed trials are handled by Stripe webhooks.
 *
 * Additionally sends a courtesy notification to users whose trial is about to expire
 * (2 days before expiry).
 */
import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'
import { emailQueue } from '../queues/notification-email.queue'

const trialExpiryWorker = new Worker(
  'trial-expiry',
  async () => {
    const now = new Date().toISOString()
    logger.info('Running trial expiry sweep...')

    // ── 1. Expire overdue local trials ──────────────────────────────────
    // Only target local trials (no stripe_subscription_id) that are still 'trialing'
    const { data: expiredTrials, error: expErr } = await supabase
      .from('subscriptions')
      .select('id, company_id, expires_at')
      .eq('plan', 'trial')
      .eq('status', 'trialing')
      .is('stripe_subscription_id', null)
      .lte('expires_at', now)
      .limit(500)

    if (expErr) {
      logger.error({ err: expErr }, 'Failed to fetch expired trials')
      return
    }

    if (expiredTrials && expiredTrials.length > 0) {
      const ids = expiredTrials.map((t: { id: string }) => t.id)
      const { error: updateErr } = await supabase
        .from('subscriptions')
        .update({ status: 'expired' })
        .in('id', ids)

      if (updateErr) {
        logger.error({ err: updateErr }, 'Failed to expire trial subscriptions')
      } else {
        logger.info({ count: expiredTrials.length }, 'Expired local trial subscriptions')
      }

      // Notify users of expired trials
      for (const trial of expiredTrials) {
        try {
          const { data: users } = await supabase
            .from('users')
            .select('id, email, telegram_chat_id')
            .eq('company_id', trial.company_id)

          for (const user of users || []) {
            if (user.email) {
              await emailQueue.add(
                `trial-expired-${user.id}`,
                {
                  userEmail: user.email,
                  userId: user.id,
                  type: 'trial_expired',
                },
                { jobId: `trial-expired-${user.id}-${Date.now()}` },
              )
            }
          }
        } catch (err) {
          logger.warn({ companyId: trial.company_id, err }, 'Failed to notify trial expiry (non-critical)')
        }
      }
    }

    // ── 2. Warn users whose trial expires in 2 days ─────────────────────
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    const oneDayFromNow = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString()

    const { data: soonExpiring } = await supabase
      .from('subscriptions')
      .select('id, company_id, expires_at')
      .eq('plan', 'trial')
      .eq('status', 'trialing')
      .is('stripe_subscription_id', null)
      .gte('expires_at', oneDayFromNow)
      .lte('expires_at', twoDaysFromNow)
      .limit(200)

    if (soonExpiring && soonExpiring.length > 0) {
      for (const trial of soonExpiring) {
        try {
          const { data: users } = await supabase
            .from('users')
            .select('id, email, telegram_chat_id')
            .eq('company_id', trial.company_id)

          for (const user of users || []) {
            // Send email warning
            if (user.email) {
              await emailQueue.add(
                `trial-warning-${user.id}`,
                {
                  userEmail: user.email,
                  userId: user.id,
                  type: 'trial_expiring_soon',
                },
                {
                  jobId: `trial-warning-${user.id}-${Date.now()}`,
                },
              )
            }

            // Send Telegram warning
            if (user.telegram_chat_id) {
              try {
                const { bot } = await import('../telegram/bot')
                if (bot) {
                  const daysLeft = Math.ceil(
                    (new Date(trial.expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
                  )
                  await bot.api.sendMessage(
                    user.telegram_chat_id,
                    `⏰ *Seu trial do Licitagram expira em ${daysLeft} dia${daysLeft > 1 ? 's' : ''}!*\n\n` +
                      `Para continuar recebendo alertas de licitações e usando todas as funcionalidades, escolha um plano:\n\n` +
                      `👉 https://licitagram.com/billing\n\n` +
                      `_Equipe Licitagram_`,
                    { parse_mode: 'Markdown' },
                  )
                }
              } catch (tgErr) {
                logger.debug({ userId: user.id, err: tgErr }, 'Trial warning TG failed')
              }
            }
          }
        } catch (err) {
          logger.warn({ companyId: trial.company_id, err }, 'Failed to send trial expiry warning (non-critical)')
        }
      }

      logger.info({ count: soonExpiring.length }, 'Sent trial expiry warnings')
    }

    const total = (expiredTrials?.length || 0) + (soonExpiring?.length || 0)
    logger.info({ expired: expiredTrials?.length || 0, warned: soonExpiring?.length || 0 }, 'Trial expiry sweep complete')
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 600_000,
    stalledInterval: 600_000,
  },
)

trialExpiryWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Trial expiry job failed')
})

export { trialExpiryWorker }
