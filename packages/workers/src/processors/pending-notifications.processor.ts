import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { notificationQueue, NOTIFICATION_PRIORITY } from '../queues/notification.queue'
import { whatsappQueue } from '../queues/notification-whatsapp.queue'
import { emailQueue } from '../queues/notification-email.queue'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'
import { purgeNonCompetitiveMatches } from '../lib/notification-guard'

/**
 * Determine job priority based on match score and age.
 * Uses NOTIFICATION_PRIORITY constants for consistency across the system.
 */
function getJobPriority(score: number, createdAt: string | null): number {
  // Super hot matches always get top priority
  if (score >= 85) return NOTIFICATION_PRIORITY.SUPER_HOT
  if (score >= 70) return NOTIFICATION_PRIORITY.HOT

  // For normal-score matches, prioritize fresher ones
  if (!createdAt) return NOTIFICATION_PRIORITY.NORMAL
  const ageMs = Date.now() - new Date(createdAt).getTime()
  const ageHours = ageMs / (60 * 60 * 1000)
  if (ageHours < 2) return NOTIFICATION_PRIORITY.HOT
  if (ageHours < 48) return NOTIFICATION_PRIORITY.NORMAL
  return NOTIFICATION_PRIORITY.DIGEST
}

/**
 * Batch size per cycle by plan tier.
 * The pending check runs every 5 min (288x/day).
 * We spread notifications by sending small batches, not dumping all at once.
 */
const BATCH_BY_PLAN: Record<string, number> = {
  enterprise: 5,
  pro: 3,
  trial: 2,
  free: 1,
}

const BACKLOG_BATCH_BY_PLAN: Record<string, number> = {
  enterprise: 15,
  pro: 10,
  trial: 5,
  free: 2,
}

const MIN_DAILY_BY_PLAN: Record<string, number> = {
  enterprise: 5,
  pro: 3,
  trial: 1,
  free: 1,
}

const MAX_NOTIFICATIONS_PER_USER = 50

interface CompanySettings {
  companyId: string
  minScore: number
  minValor: number | null
  maxValor: number | null
}

/**
 * Pending notifications processor
 * Runs every 5 minutes to find matches that haven't been notified yet
 * and sends them to users who have Telegram or WhatsApp linked.
 *
 * Multi-company: iterates ALL companies with notifications_enabled per user.
 * Value filter: respects min_valor/max_valor per company.
 */
const pendingNotificationsWorker = new Worker(
  'pending-notifications',
  async () => {
    logger.info('Checking for pending notifications...')

    // ── STARTUP PURGE: clean non-competitive matches that slipped through ──
    try {
      const purged = await purgeNonCompetitiveMatches()
      if (purged > 0) {
        logger.info({ purged }, 'Purged non-competitive matches before notification cycle')
      }
    } catch (purgeErr) {
      logger.warn({ err: purgeErr }, 'Purge non-competitive matches failed (non-critical)')
    }

    // Find users with any notification channel linked
    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('id, company_id, email, telegram_chat_id, whatsapp_number, whatsapp_verified, min_score, notification_preferences')
      .not('company_id', 'is', null)

    if (usersErr) {
      logger.error({ err: usersErr }, 'Failed to fetch users for notifications')
      return
    }

    if (!users || users.length === 0) {
      logger.info('No users with notification channels, skipping')
      return
    }

    // ── Fetch ALL user_companies with notifications_enabled in ONE query ──
    const userIds = users.map((u: { id: string }) => u.id)
    const { data: allUserCompanies } = await supabase
      .from('user_companies')
      .select('user_id, company_id, notifications_enabled')
      .in('user_id', userIds)
      .eq('notifications_enabled', true)

    // Group by user_id for fast lookup
    const companiesByUser = new Map<string, string[]>()
    for (const uc of allUserCompanies || []) {
      const list = companiesByUser.get(uc.user_id) || []
      list.push(uc.company_id)
      companiesByUser.set(uc.user_id, list)
    }

    // ── Fetch company settings (min_score, min_valor, max_valor) for ALL companies ──
    const allCompanyIds = new Set<string>()
    for (const user of users) {
      const enabledCompanies = companiesByUser.get(user.id)
      if (enabledCompanies && enabledCompanies.length > 0) {
        enabledCompanies.forEach((id) => allCompanyIds.add(id))
      } else if (user.company_id) {
        allCompanyIds.add(user.company_id)
      }
    }

    const companyIdList = Array.from(allCompanyIds)
    if (companyIdList.length === 0) {
      logger.info('No companies to check, skipping')
      return
    }

    const { data: companyRows } = await supabase
      .from('companies')
      .select('id, min_score, min_valor, max_valor, target_ufs')
      .in('id', companyIdList)

    const companySettingsMap = new Map<string, any>()
    for (const c of companyRows || []) {
      companySettingsMap.set(c.id, {
        companyId: c.id,
        minScore: c.min_score ?? 50,
        minValor: c.min_valor ?? null,
        maxValor: c.max_valor ?? null,
        targetUfs: (c.target_ufs as string[]) || [],
      })
    }

    // Get subscriptions for all companies to know their plan
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('company_id, plan, status')
      .in('company_id', companyIdList)
      .in('status', ['active', 'trialing'])

    const planByCompany = new Map<string, string>()
    for (const sub of subs || []) {
      planByCompany.set(sub.company_id, sub.plan)
    }

    const now = new Date()
    const currentHourUTC = now.getUTCHours()
    const isLateDay = currentHourUTC >= 21 // 18h BRT = 21h UTC
    const today = now.toISOString().split('T')[0]

    // ── Batch sentToday count for ALL companies at once ──
    const sentTodayByCompany = new Map<string, number>()
    const { data: notifiedRows } = await supabase
      .from('matches')
      .select('company_id')
      .in('company_id', companyIdList)
      .gte('notified_at', `${today}T00:00:00`)
      .limit(5000)

    for (const row of notifiedRows || []) {
      sentTodayByCompany.set(row.company_id, (sentTodayByCompany.get(row.company_id) || 0) + 1)
    }

    let totalEnqueued = 0

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const cutoffDate = thirtyDaysAgo.toISOString()

    const EXCLUDED_MODS = new Set([9, 12, 14])

    for (const user of users) {
      const prefs = (user.notification_preferences as Record<string, boolean>) || {}
      const hasTelegram = user.telegram_chat_id && prefs.telegram !== false
      const hasWhatsApp = user.whatsapp_number && user.whatsapp_verified && prefs.whatsapp !== false
      const hasEmail = user.email && prefs.email !== false

      // FIXED: also process users who only have email
      if (!hasTelegram && !hasWhatsApp && !hasEmail) continue

      // Get companies this user should receive notifications for
      const enabledCompanies = companiesByUser.get(user.id)
      const companyIdsForUser = (enabledCompanies && enabledCompanies.length > 0)
        ? enabledCompanies
        : (user.company_id ? [user.company_id] : [])

      if (companyIdsForUser.length === 0) continue

      // ── Loop through each company ──
      for (const companyId of companyIdsForUser) {
        const settings = companySettingsMap.get(companyId) || { companyId, minScore: 50, minValor: null, maxValor: null }
        const plan = planByCompany.get(companyId) || 'free'
        const batchSize = BATCH_BY_PLAN[plan] || 1
        const minDaily = MIN_DAILY_BY_PLAN[plan] || 1

        // Unified query: fetch ALL matches above company minScore, any source.
        // Quality gates:
        //   - AI-verified (ai, ai_triage, semantic): trust any score >= minScore
        //   - Keyword matches: trust score >= 65 (CNAE-gated Mode A caps at 90, Mode B at 65)
        //     Score >= 65 means CNAE overlap was validated by keyword-matcher
        //   - Below 65: AI triage will handle (skip for now)
        // This eliminates the AI triage bottleneck for high-confidence matches.
        // Trust keyword matches at company minScore — they already passed CNAE validation in matcher

        const { data: allMatches } = await supabase
          .from('matches')
          .select('id, score, match_source, breakdown, created_at, tenders!inner(data_encerramento, modalidade_id, valor_estimado, uf)')
          .eq('company_id', companyId)
          .eq('status', 'new')
          .gte('score', settings.minScore)
          .gte('created_at', cutoffDate)
          .is('notified_at', null)
          .gte('tenders.data_encerramento', today)
          .not('tenders.modalidade_id', 'in', '(9,12,14)')
          .order('score', { ascending: false })
          .limit(MAX_NOTIFICATIONS_PER_USER)

        // Quality gate: filter keyword matches without CNAE validation
        const pendingMatches = (allMatches || []).filter((m: any) => {
          // AI-verified sources always pass
          if (['ai', 'ai_triage', 'semantic'].includes(m.match_source)) return true

          // Keyword matches: trust at company minScore, but check CNAE overlap
          if (m.match_source === 'keyword') {
            const breakdown = m.breakdown as Array<{ category: string; score: number }> | null
            if (breakdown) {
              const cnaeEntry = breakdown.find((b) => b.category?.toLowerCase() === 'cnae')
              if (cnaeEntry && cnaeEntry.score === 0) return false // No CNAE overlap = don't trust
            }
            return true
          }

          // Unknown source: require high score
          return m.score >= 75
        }).slice(0, MAX_NOTIFICATIONS_PER_USER)

        if (!pendingMatches || pendingMatches.length === 0) continue

        // Filter out expired tenders, non-competitive modalities, and value range
        const validMatches = pendingMatches.filter((m: any) => {
          const mod = m.tenders?.modalidade_id
          if (mod && EXCLUDED_MODS.has(mod)) return false
          const enc = m.tenders?.data_encerramento
          if (enc && enc < today) return false

          // Value filter: respect company min_valor / max_valor
          const valor = m.tenders?.valor_estimado
          if (valor != null) {
            if (settings.minValor != null && valor < settings.minValor) return false
            if (settings.maxValor != null && valor > settings.maxValor) return false
          }
          // Geography filter: respect target_ufs
          const tenderUf = m.tenders?.uf
          if (settings.targetUfs.length > 0 && tenderUf && !settings.targetUfs.includes(tenderUf)) return false

          return true
        })

        if (validMatches.length === 0) continue

        const alreadySent = sentTodayByCompany.get(companyId) || 0

        const backlogBatch = BACKLOG_BATCH_BY_PLAN[plan] || 5
        let cycleBatch = validMatches.length > 50 ? backlogBatch : batchSize

        if (isLateDay && alreadySent < minDaily) {
          cycleBatch = Math.max(cycleBatch, minDaily - alreadySent)
        }

        const batch = validMatches.slice(0, cycleBatch)

        logger.info(
          {
            userId: user.id,
            companyId,
            plan,
            pendingCount: validMatches.length,
            sentToday: alreadySent,
            sending: batch.length,
            minDaily,
            minValor: settings.minValor,
            maxValor: settings.maxValor,
          },
          'Found pending matches for user/company',
        )

        for (const match of batch) {
          try {
            const priority = getJobPriority(match.score, (match as any).created_at)

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
                },
              )
            }

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
                },
              )
            }

            // Email notifications
            if (hasEmail) {
              await emailQueue.add(
                `em-${user.id}-${match.id}`,
                {
                  matchId: match.id,
                  userEmail: user.email,
                  userId: user.id,
                },
                {
                  jobId: `em-${user.id}-${match.id}`,
                  priority,
                },
              )
            }

            totalEnqueued++
          } catch (enqueueErr) {
            logger.debug({ matchId: match.id, err: enqueueErr }, 'Skipped notification job')
          }
        }
      }
    }

    logger.info({ totalEnqueued }, 'Pending notifications check complete')
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 600_000,    // 10 min — processes many notifications per run
    stalledInterval: 600_000,
  },
)

pendingNotificationsWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Pending notifications job failed')
})

export { pendingNotificationsWorker }
