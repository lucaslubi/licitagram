import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { notificationQueue } from '../queues/notification.queue'
import type { UrgencyMatchItem } from '../queues/notification.queue'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

const AI_SOURCES = ['ai', 'ai_triage', 'semantic']
const EXCLUDED_MODALIDADES = [9, 14]
const ACTIVE_STATUSES = ['new', 'notified', 'viewed', 'interested']
const HOT_SCORE_THRESHOLD = 70
const HOT_TOP_N = 10
const HOT_SCORE_RELEVANCE_WEIGHT = 0.6
const HOT_SCORE_COMPETITION_WEIGHT = 0.4

interface CompetitorInfo {
  nome: string
  winRate: number
  porte: string
}

/**
 * Calculate competition_score for a match based on competitor_stats.
 * Returns { score, topCompetitors } or null if no data.
 */
async function calculateCompetitionScore(
  tenderUf: string | null,
  companyCnaeDivisions: string[],
): Promise<{ score: number; topCompetitors: CompetitorInfo[] } | null> {
  if (!tenderUf || companyCnaeDivisions.length === 0) return null

  // Find competitors who operate in the same CNAE AND UF
  // Uses the find_competitors_by_cnae_uf RPC (GIN ? operator not expressible via Supabase JS)
  const { data: stats, error } = await supabase.rpc('find_competitors_by_cnae_uf', {
    p_cnae_divisions: companyCnaeDivisions,
    p_uf: tenderUf,
  })

  if (error) {
    logger.warn({ error, tenderUf, companyCnaeDivisions }, 'Failed to query competitor stats')
    return null
  }

  if (!stats || stats.length === 0) return null

  const competitors = stats

  // Factor 1: Competition density (30%)
  const n = competitors.length
  let densityScore: number
  if (n === 0) densityScore = 100
  else if (n <= 3) densityScore = 80
  else if (n <= 7) densityScore = 60
  else if (n <= 15) densityScore = 40
  else densityScore = 20

  // Factor 2: Competitor strength (30%)
  const avgWinRate = competitors.reduce((s: number, c: Record<string, unknown>) => s + Number(c.win_rate || 0), 0) / Math.max(n, 1)
  let strengthScore: number
  if (avgWinRate < 0.2) strengthScore = 90
  else if (avgWinRate < 0.4) strengthScore = 70
  else if (avgWinRate < 0.6) strengthScore = 50
  else if (avgWinRate < 0.8) strengthScore = 30
  else strengthScore = 10

  // Factor 3: Geographic advantage (20%)
  const geoWinRates = competitors.map((c: Record<string, unknown>) => {
    const pByUf = (c.participations_by_uf as Record<string, number>) || {}
    const wByUf = (c.wins_by_uf as Record<string, number>) || {}
    const p = pByUf[tenderUf] || 0
    const w = wByUf[tenderUf] || 0
    return p > 0 ? w / p : 0
  })
  const avgGeoWinRate = geoWinRates.reduce((s: number, r: number) => s + r, 0) / Math.max(geoWinRates.length, 1)
  // Low competitor win rate in this UF = high geo advantage
  const geoScore = Math.round(100 - avgGeoWinRate * 100)

  // Factor 4: Discount pattern (20%)
  const discounts = competitors
    .map((c: Record<string, unknown>) => Number(c.avg_discount_pct || 0))
    .filter((d: number) => d > 0)
  const avgDiscount = discounts.length > 0
    ? discounts.reduce((s: number, d: number) => s + d, 0) / discounts.length
    : 0
  let discountScore: number
  if (avgDiscount < 0.05) discountScore = 90
  else if (avgDiscount < 0.10) discountScore = 75
  else if (avgDiscount < 0.15) discountScore = 60
  else if (avgDiscount < 0.20) discountScore = 45
  else discountScore = 30

  const score = Math.round(
    densityScore * 0.30 +
    strengthScore * 0.30 +
    geoScore * 0.20 +
    discountScore * 0.20,
  )

  // Top 3 competitors by win rate for display
  const topCompetitors: CompetitorInfo[] = competitors
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(b.win_rate || 0) - Number(a.win_rate || 0))
    .slice(0, 3)
    .map((c: Record<string, unknown>) => ({
      nome: (c.nome as string) || 'N/I',
      winRate: Math.round(Number(c.win_rate || 0) * 100),
      porte: (c.porte as string) || 'N/I',
    }))

  return { score: Math.min(100, Math.max(0, score)), topCompetitors }
}

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
  const planCache = new Map<string, string>()
  let totalMarked = 0
  let totalEnqueued = 0

  for (const [companyId, users] of companyUsers) {
    // Query ALL matches with score >= 80, AI sources only, still open (not expired)
    // No created_at filter — we want to surface the best opportunities regardless of when they were matched
    const { data: matches } = await supabase
      .from('matches')
      .select(`
        id, score, notified_at, is_hot,
        tenders!inner(data_encerramento, modalidade_id, uf)
      `)
      .eq('company_id', companyId)
      .gte('score', HOT_SCORE_THRESHOLD)
      .in('status', ACTIVE_STATUSES)
      .in('match_source', AI_SOURCES)
      .not('tenders.modalidade_id', 'in', `(${EXCLUDED_MODALIDADES.join(',')})`)
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
      .order('score', { ascending: false })
      .limit(HOT_TOP_N)

    if (!matches || matches.length === 0) continue

    const plan = await getCompanyPlan(companyId, planCache)

    // Get company CNAE divisions for competition analysis
    const { data: company } = await supabase
      .from('companies')
      .select('cnae_principal, cnaes_secundarios')
      .eq('id', companyId)
      .single()

    const cnaeDivisions: string[] = []
    if (company?.cnae_principal) {
      cnaeDivisions.push(company.cnae_principal.substring(0, 2))
    }
    if (company?.cnaes_secundarios) {
      for (const c of company.cnaes_secundarios) {
        const div = c.substring(0, 2)
        if (!cnaeDivisions.includes(div)) cnaeDivisions.push(div)
      }
    }

    // Calculate competition_score for each match and compute hot_score
    const scoredMatches: Array<{
      match: typeof matches[0]
      hotScore: number
      competitionScore: number
      topCompetitors: CompetitorInfo[]
    }> = []

    for (const match of matches) {
      const tender = match.tenders as unknown as Record<string, unknown>
      const tenderUf = tender.uf as string | null

      let competitionScore = 50 // default neutral
      let topCompetitors: CompetitorInfo[] = []

      const result = await calculateCompetitionScore(tenderUf, cnaeDivisions)
      if (result) {
        competitionScore = result.score
        topCompetitors = result.topCompetitors
      }

      // Save competition_score to DB
      await supabase
        .from('matches')
        .update({ competition_score: competitionScore })
        .eq('id', match.id)

      const hotScore = match.score * HOT_SCORE_RELEVANCE_WEIGHT +
        competitionScore * HOT_SCORE_COMPETITION_WEIGHT

      scoredMatches.push({ match, hotScore, competitionScore, topCompetitors })
    }

    // Sort by hot_score descending and take top N
    scoredMatches.sort((a, b) => b.hotScore - a.hotScore)
    const topMatches = scoredMatches.slice(0, HOT_TOP_N)

    for (let i = 0; i < topMatches.length; i++) {
      const { match, competitionScore, topCompetitors } = topMatches[i]
      const rank = i + 1

      // Mark as hot if not already
      if (!match.is_hot) {
        await supabase
          .from('matches')
          .update({ is_hot: true, hot_at: new Date().toISOString() })
          .eq('id', match.id)
        totalMarked++
      }

      // Skip Telegram send only if this match was already sent as hot
      if (match.is_hot) continue

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
              competitionScore,
              topCompetitors,
            },
          )
          totalEnqueued++
        } catch (err) {
          logger.debug({ matchId: match.id, err }, 'Failed to enqueue hot notification')
        }
      }

      // Mark as notified (only if still 'new')
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

  // Step 1: Expire hot markers for matches whose tenders already closed
  const nowISO = new Date().toISOString()
  const { data: hotMatches } = await supabase
    .from('matches')
    .select('id, tenders!inner(data_encerramento)')
    .eq('is_hot', true)
    .lt('tenders.data_encerramento', nowISO)

  const expiredIds = (hotMatches || []).map((m) => m.id)
  let expiredCount = 0
  if (expiredIds.length > 0) {
    const { data: expiredRows } = await supabase
      .from('matches')
      .update({ is_hot: false })
      .in('id', expiredIds)
      .select('id')
    expiredCount = expiredRows?.length ?? 0
  }

  if (expiredCount > 0) {
    logger.info({ expiredCount }, 'Expired hot markers (tender closed)')
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
