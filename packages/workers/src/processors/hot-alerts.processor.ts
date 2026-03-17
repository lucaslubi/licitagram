import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { notificationQueue } from '../queues/notification.queue'
import type { UrgencyMatchItem } from '../queues/notification.queue'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

const AI_SOURCES = ['ai', 'ai_triage', 'semantic']
const EXCLUDED_MODALIDADES = [9, 14]
const ACTIVE_STATUSES = ['new', 'notified', 'viewed', 'interested']
const HOT_SCORE_THRESHOLD = 80
const HOT_TOP_N = 10

/**
 * Fetch users with Telegram enabled, grouped by company_id.
 */
async function getTelegramUsersByCompany(): Promise<
  Map<string, Array<{ id: string; telegram_chat_id: number }>>
> {
  const { data: users } = await supabase
    .from('users')
    .select('id, company_id, telegram_chat_id, notification_preferences')
    .not('company_id', 'is', null)
    .not('telegram_chat_id', 'is', null)

  if (!users || users.length === 0) return new Map()

  const grouped = new Map<string, Array<{ id: string; telegram_chat_id: number }>>()
  for (const u of users) {
    const prefs = (u.notification_preferences as Record<string, boolean>) || {}
    if (prefs.telegram === false) continue
    if (!u.company_id || !u.telegram_chat_id) continue

    const list = grouped.get(u.company_id) || []
    list.push({ id: u.id, telegram_chat_id: u.telegram_chat_id })
    grouped.set(u.company_id, list)
  }
  return grouped
}

/**
 * Get active subscription plan slug for a company.
 * Results are cached in the provided Map for the duration of the batch.
 */
async function getCompanyPlan(
  companyId: string,
  cache: Map<string, string>,
): Promise<string> {
  if (cache.has(companyId)) return cache.get(companyId)!

  const { data } = await supabase
    .from('subscriptions')
    .select('plan')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .limit(1)
    .single()

  const plan = data?.plan || 'trial'
  cache.set(companyId, plan)
  return plan
}

// ─── Job 1: hot-daily ─────────────────────────────────────────────────────
async function handleHotDaily() {
  logger.info('Running hot-daily job...')

  const companyUsers = await getTelegramUsersByCompany()
  if (companyUsers.size === 0) {
    logger.info('No Telegram users found for hot-daily')
    return
  }

  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const planCache = new Map<string, string>()
  let totalMarked = 0
  let totalEnqueued = 0

  for (const [companyId, users] of companyUsers) {
    // Query matches from last 24h with score >= 80, AI sources only, non-expired
    const { data: matches } = await supabase
      .from('matches')
      .select(`
        id, score, notified_at, is_hot,
        tenders!inner(data_encerramento, modalidade_id)
      `)
      .eq('company_id', companyId)
      .gte('score', HOT_SCORE_THRESHOLD)
      .gte('created_at', yesterday)
      .in('match_source', AI_SOURCES)
      .not('tenders.modalidade_id', 'in', `(${EXCLUDED_MODALIDADES.join(',')})`)
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
      .order('score', { ascending: false })
      .limit(HOT_TOP_N)

    if (!matches || matches.length === 0) continue

    const plan = await getCompanyPlan(companyId, planCache)

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]
      const rank = i + 1

      // Mark as hot if not already
      if (!match.is_hot) {
        await supabase
          .from('matches')
          .update({ is_hot: true, hot_at: new Date().toISOString() })
          .eq('id', match.id)
        totalMarked++
      }

      // Skip Telegram send if already notified (dedup with normal notifications)
      if (match.notified_at) continue

      // Enqueue hot notification for each user
      for (const user of users) {
        try {
          await notificationQueue.add(
            `hot-${companyId}-${match.id}-${user.id}`,
            {
              matchId: match.id,
              telegramChatId: user.telegram_chat_id,
              type: 'hot' as const,
              rank,
              plan,
            },
          )
          totalEnqueued++
        } catch (err) {
          logger.debug({ matchId: match.id, err }, 'Failed to enqueue hot notification')
        }
      }

      // Mark as notified (only if still 'new' to avoid overwriting user actions)
      await supabase
        .from('matches')
        .update({ status: 'notified', notified_at: new Date().toISOString() })
        .eq('id', match.id)
        .eq('status', 'new')
    }
  }

  logger.info({ totalMarked, totalEnqueued }, 'hot-daily job complete')
}

// ─── Job 2: urgency-check ─────────────────────────────────────────────────
async function handleUrgencyCheck() {
  logger.info('Running urgency-check job...')

  // Step 1: Expire stale hot markers (older than 48h)
  const expired48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { data: expiredRows, error: expireErr } = await supabase
    .from('matches')
    .update({ is_hot: false })
    .eq('is_hot', true)
    .lt('hot_at', expired48h)
    .select('id')

  const expiredCount = expireErr ? 0 : (expiredRows?.length ?? 0)

  if (expiredCount && expiredCount > 0) {
    logger.info({ expiredCount }, 'Expired stale hot markers')
  }

  // Step 2: Find users + companies
  const companyUsers = await getTelegramUsersByCompany()
  if (companyUsers.size === 0) return

  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()
  const today = now.toISOString().split('T')[0]
  let totalUrgencySent = 0

  for (const [companyId, users] of companyUsers) {
    // Query matches with active status, AI sources, closing within 48h
    const { data: matches } = await supabase
      .from('matches')
      .select(`
        id, score, urgency_48h_sent, urgency_24h_sent,
        tenders!inner(id, objeto, orgao_nome, uf, municipio, valor_estimado, modalidade_nome, data_encerramento, numero, ano_compra, modalidade_id)
      `)
      .eq('company_id', companyId)
      .in('status', ACTIVE_STATUSES)
      .in('match_source', AI_SOURCES)
      .not('tenders.modalidade_id', 'in', `(${EXCLUDED_MODALIDADES.join(',')})`)
      .gte('tenders.data_encerramento', now.toISOString())
      .lte('tenders.data_encerramento', in48h)

    if (!matches || matches.length === 0) continue

    // Split into 24h and 48h tiers
    const tier24h: typeof matches = []
    const tier48h: typeof matches = []

    for (const m of matches) {
      const tender = m.tenders as unknown as Record<string, unknown>
      const encerramento = new Date(tender.data_encerramento as string)
      const hoursLeft = (encerramento.getTime() - now.getTime()) / (1000 * 60 * 60)

      if (hoursLeft <= 24 && !m.urgency_24h_sent) {
        tier24h.push(m)
      } else if (hoursLeft > 24 && hoursLeft <= 48 && !m.urgency_48h_sent) {
        tier48h.push(m)
      }
    }

    // Process each tier
    for (const [tier, tierMatches, tierType] of [
      ['urgency_24h', tier24h, 'urgency_24h'] as const,
      ['urgency_48h', tier48h, 'urgency_48h'] as const,
    ]) {
      if (tierMatches.length === 0) continue

      const matchItems: UrgencyMatchItem[] = tierMatches.map((m) => {
        const t = m.tenders as unknown as Record<string, unknown>
        return {
          id: m.id,
          score: m.score,
          objeto: (t.objeto as string) || '',
          orgao: (t.orgao_nome as string) || '',
          uf: (t.uf as string) || '',
          municipio: (t.municipio as string) || '',
          valor: (t.valor_estimado as number) || 0,
          modalidade: (t.modalidade_nome as string) || '',
          dataEncerramento: (t.data_encerramento as string) || '',
          numero: (t.numero as string) || '',
          ano: (t.ano_compra as string) || '',
        }
      })

      const totalValor = matchItems.reduce((sum, m) => sum + m.valor, 0)

      // Enqueue grouped urgency alert for each user
      for (const user of users) {
        try {
          await notificationQueue.add(
            `${tierType}-${companyId}-${user.id}-${Date.now()}`,
            {
              telegramChatId: user.telegram_chat_id,
              type: tierType,
              matches: matchItems,
              totalValor,
            },
          )
          totalUrgencySent++
        } catch (err) {
          logger.debug({ companyId, tier, err }, 'Failed to enqueue urgency notification')
        }
      }

      // Mark urgency sent
      const sentField = tier === 'urgency_24h' ? 'urgency_24h_sent' : 'urgency_48h_sent'
      const matchIds = tierMatches.map((m) => m.id)
      await supabase
        .from('matches')
        .update({ [sentField]: true })
        .in('id', matchIds)
    }
  }

  logger.info({ totalUrgencySent }, 'urgency-check job complete')
}

// ─── Worker ───────────────────────────────────────────────────────────────
const hotAlertsWorker = new Worker(
  'hot-alerts',
  async (job) => {
    switch (job.name) {
      case 'hot-daily':
        await handleHotDaily()
        break
      case 'urgency-check':
        await handleUrgencyCheck()
        break
      default:
        logger.warn({ jobName: job.name }, 'Unknown hot-alerts job name')
    }
  },
  {
    connection,
    concurrency: 1,
  },
)

hotAlertsWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Hot alerts job failed')
})

export { hotAlertsWorker }
