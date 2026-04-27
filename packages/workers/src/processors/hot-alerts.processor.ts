import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { notificationQueue, NOTIFICATION_PRIORITY } from '../queues/notification.queue'
import type { UrgencyMatchItem } from '../queues/notification.queue'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'

// MATCH_SOURCES_FOR_HOT_ALERT: sources eligible for hot-alert escalation.
// pgvector_rules é o substituto deterministic do ai-triage desde 2026-04-21
// (ai-triage descontinuado; pgvector é o engine principal de matching).
const MATCH_SOURCES_FOR_HOT_ALERT = ['ai', 'ai_triage', 'semantic', 'pgvector_rules']
// Inexigibilidade (9), Credenciamento (12), Inaplicabilidade (14) — impossible to bid competitively
const EXCLUDED_MODALIDADES = [9, 12, 14]
const ACTIVE_STATUSES = ['new', 'notified', 'viewed', 'interested']

// ─── Tuned thresholds for quality hot alerts ─────────────────────────────
// Only matches with relevance_score >= 80 can be considered hot (Super Quente).
// Aligned with global color system: 50-69 yellow, 70-79 green, 80+ hot.
const HOT_RELEVANCE_MIN = 80
const HOT_TOP_N = 30
// Final hot_score weights: 70% relevance (the match quality is king) + 30% competition
const HOT_SCORE_RELEVANCE_WEIGHT = 0.7
const HOT_SCORE_COMPETITION_WEIGHT = 0.3
// Only mark as hot if the final weighted hot_score reaches this threshold
const HOT_FINAL_THRESHOLD = 65

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
  const allStats: Record<string, unknown>[] = []
  const seenCnpjs = new Set<string>()

  for (const div of companyCnaeDivisions) {
    const { data: stats, error } = await supabase.rpc('find_competitors_by_cnae_uf', {
      p_cnae_divisao: div,
      p_uf: tenderUf,
      p_limit: 20,
    })

    if (error) {
      logger.warn({ error, tenderUf, cnaeDivisao: div }, 'Failed to query competitor stats')
      continue
    }

    if (stats) {
      for (const s of stats as Record<string, unknown>[]) {
        const cnpj = s.cnpj as string
        if (!seenCnpjs.has(cnpj)) {
          seenCnpjs.add(cnpj)
          allStats.push(s)
        }
      }
    }
  }

  if (allStats.length === 0) return null

  const competitors = allStats

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
  if (avgWinRate < 20) strengthScore = 90
  else if (avgWinRate < 40) strengthScore = 70
  else if (avgWinRate < 60) strengthScore = 50
  else if (avgWinRate < 80) strengthScore = 30
  else strengthScore = 10

  // Factor 3: Geographic advantage (20%)
  const avgGeoWinRate = avgWinRate / 100
  const geoScore = Math.round(100 - avgGeoWinRate * 100)

  // Factor 4: Discount pattern (20%)
  const discounts = competitors
    .map((c: Record<string, unknown>) => Number(c.desconto_medio || 0))
    .filter((d: number) => d > 0)
  const avgDiscount = discounts.length > 0
    ? discounts.reduce((s: number, d: number) => s + d, 0) / discounts.length
    : 0
  let discountScore: number
  if (avgDiscount < 5) discountScore = 90
  else if (avgDiscount < 10) discountScore = 75
  else if (avgDiscount < 15) discountScore = 60
  else if (avgDiscount < 20) discountScore = 45
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
      nome: (c.razao_social as string) || (c.nome as string) || 'N/I',
      winRate: Math.round(Number(c.win_rate || 0) * 100),
      porte: (c.porte as string) || 'N/I',
    }))

  return { score: Math.min(100, Math.max(0, score)), topCompetitors }
}

/**
 * Fetch ALL companies with their users (Telegram or not).
 * Hot marking happens for ALL companies WITH ACTIVE SUBSCRIPTION.
 * Telegram notifications only for users with telegram_chat_id.
 *
 * Subscription gate: trial expirado, canceled, expired, inactive são bloqueados —
 * só active + trialing (com expires_at no futuro) recebem hot/urgency/digest.
 * Sem isso, hot-alerts marcava `status=notified` em matches de subs vencidas
 * (notification.processor blocked depois via guard, mas o estado do match já tinha mudado).
 */
async function getCompaniesWithUsers(): Promise<
  Map<string, Array<{ id: string; telegram_chat_id: number | null }>>
> {
  const { data: users } = await supabase
    .from('users')
    .select('id, company_id, telegram_chat_id, notification_preferences')
    .not('company_id', 'is', null)

  if (!users || users.length === 0) return new Map()

  // Build company → users map
  const grouped = new Map<string, Array<{ id: string; telegram_chat_id: number | null }>>()
  for (const u of users) {
    if (!u.company_id) continue
    const list = grouped.get(u.company_id) || []
    list.push({ id: u.id, telegram_chat_id: u.telegram_chat_id })
    grouped.set(u.company_id, list)
  }

  // Filter to only companies with active subscriptions
  const companyIds = Array.from(grouped.keys())
  if (companyIds.length === 0) return grouped

  const { data: subs } = await supabase
    .from('subscriptions')
    .select('company_id, status, expires_at')
    .in('company_id', companyIds)

  const now = new Date()
  const allowed = new Set<string>()
  for (const sub of subs || []) {
    const isActive = sub.status === 'active'
    const isTrialing = sub.status === 'trialing'
    const expiresAt = sub.expires_at ? new Date(sub.expires_at as string) : null
    const trialExpiredLagged = isTrialing && expiresAt && expiresAt < now
    if ((isActive || isTrialing) && !trialExpiredLagged) {
      allowed.add(sub.company_id)
    }
  }

  // Drop companies without active sub
  for (const cid of companyIds) {
    if (!allowed.has(cid)) grouped.delete(cid)
  }

  return grouped
}

/**
 * Get active subscription plan slug for a company.
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

  // Process ALL companies (not just those with Telegram)
  const companyUsers = await getCompaniesWithUsers()
  if (companyUsers.size === 0) {
    logger.info('No companies found for hot-daily')
    return
  }

  const today = new Date().toISOString().split('T')[0]
  const planCache = new Map<string, string>()
  let totalMarked = 0
  let totalEnqueued = 0

  for (const [companyId, users] of companyUsers) {
    // Query matches with relevance score >= HOT_RELEVANCE_MIN (75)
    // Only AI-verified sources — the match must genuinely fit the company
    const { data: matches } = await supabase
      .from('matches')
      .select(`
        id, score, notified_at, is_hot,
        tenders!inner(data_encerramento, modalidade_id, uf)
      `)
      .eq('company_id', companyId)
      .gte('score', HOT_RELEVANCE_MIN)
      .in('status', ACTIVE_STATUSES)
      .in('match_source', MATCH_SOURCES_FOR_HOT_ALERT)
      .not('tenders.modalidade_id', 'in', `(${EXCLUDED_MODALIDADES.join(',')})`)
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
      .order('score', { ascending: false })
      .limit(50) // Fetch more candidates, filter by hot_score after

    if (!matches || matches.length === 0) continue

    const plan = await getCompanyPlan(companyId, planCache)

    // Get company CNAE divisions for competition analysis
    const { data: company } = await supabase
      .from('companies')
      .select('cnae_principal, cnaes_secundarios')
      .eq('id', companyId)
      .single()

    // Use 4-digit CNAE groups for precise competitor matching (RPC falls back to 2-digit if no 4-digit match)
    const cnaeDivisions: string[] = []
    if (company?.cnae_principal) {
      const grupo = company.cnae_principal.length >= 4
        ? company.cnae_principal.substring(0, 4)
        : company.cnae_principal.substring(0, 2)
      cnaeDivisions.push(grupo)
    }
    if (company?.cnaes_secundarios) {
      for (const c of company.cnaes_secundarios) {
        const grupo = c.length >= 4 ? c.substring(0, 4) : c.substring(0, 2)
        if (!cnaeDivisions.includes(grupo)) cnaeDivisions.push(grupo)
      }
    }

    // Pre-fetch competitor data for all unique UFs in a batch to avoid N+1 queries
    const uniqueUfs = new Set<string>()
    for (const match of matches) {
      const tender = match.tenders as unknown as Record<string, unknown>
      const uf = tender.uf as string | null
      if (uf) uniqueUfs.add(uf)
    }

    const competitionCache = new Map<string, { score: number; topCompetitors: CompetitorInfo[] }>()
    for (const uf of uniqueUfs) {
      const result = await calculateCompetitionScore(uf, cnaeDivisions)
      if (result) {
        competitionCache.set(uf, result)
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

      const cached = tenderUf ? competitionCache.get(tenderUf) : null
      if (cached) {
        competitionScore = cached.score
        topCompetitors = cached.topCompetitors
      }

      // Save competition_score to DB
      await supabase
        .from('matches')
        .update({ competition_score: competitionScore })
        .eq('id', match.id)

      // hot_score = 70% relevance + 30% competition
      const hotScore = Math.round(
        match.score * HOT_SCORE_RELEVANCE_WEIGHT +
        competitionScore * HOT_SCORE_COMPETITION_WEIGHT,
      )

      // Only consider if hot_score reaches the final threshold (75)
      if (hotScore >= HOT_FINAL_THRESHOLD) {
        scoredMatches.push({ match, hotScore, competitionScore, topCompetitors })
      }
    }

    if (scoredMatches.length === 0) continue

    // Sort by hot_score descending and take top N
    scoredMatches.sort((a, b) => b.hotScore - a.hotScore)
    const topMatches = scoredMatches.slice(0, HOT_TOP_N)

    // Separate users with and without Telegram
    const telegramUsers = users.filter((u) => u.telegram_chat_id != null)

    for (let i = 0; i < topMatches.length; i++) {
      const { match, hotScore, competitionScore, topCompetitors } = topMatches[i]
      const rank = i + 1
      const wasAlreadyHot = match.is_hot

      // ALWAYS mark as hot in DB (for web app display, regardless of Telegram)
      if (!wasAlreadyHot) {
        await supabase
          .from('matches')
          .update({ is_hot: true, hot_at: new Date().toISOString() })
          .eq('id', match.id)
        totalMarked++
      }

      // Send Telegram notification only for NEW hots (not already sent)
      if (wasAlreadyHot) continue
      if (telegramUsers.length === 0) continue

      for (const user of telegramUsers) {
        try {
          await notificationQueue.add(
            `hot-${companyId}-${match.id}-${user.id}`,
            {
              matchId: match.id,
              telegramChatId: user.telegram_chat_id!,
              type: 'hot' as const,
              rank,
              plan,
              competitionScore,
              topCompetitors,
            },
            {
              priority: match.score >= 85
                ? NOTIFICATION_PRIORITY.SUPER_HOT
                : NOTIFICATION_PRIORITY.HOT,
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

    if (scoredMatches.length > 0) {
      logger.info(
        { companyId: companyId.slice(0, 8), candidates: matches.length, qualified: scoredMatches.length, marked: topMatches.filter((m) => !m.match.is_hot).length },
        'Hot scan for company',
      )
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

  const expiredIds = (hotMatches || []).map((m: { id: string }) => m.id)
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

  // Step 2: Find users + companies (only those with Telegram for urgency alerts)
  const companyUsers = await getCompaniesWithUsers()
  if (companyUsers.size === 0) return

  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()
  let totalUrgencySent = 0

  for (const [companyId, users] of companyUsers) {
    // Only send urgency alerts to users with Telegram
    const telegramUsers = users.filter((u) => u.telegram_chat_id != null)
    if (telegramUsers.length === 0) continue

    // Query matches with active status, AI sources, closing within 48h
    const { data: matches } = await supabase
      .from('matches')
      .select(`
        id, score, urgency_48h_sent, urgency_24h_sent,
        tenders!inner(id, objeto, orgao_nome, uf, municipio, valor_estimado, modalidade_nome, data_encerramento, numero, ano_compra, modalidade_id)
      `)
      .eq('company_id', companyId)
      .in('status', ACTIVE_STATUSES)
      .in('match_source', MATCH_SOURCES_FOR_HOT_ALERT)
      .gte('score', HOT_RELEVANCE_MIN) // Only urgency for high-quality matches
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

      const matchItems: UrgencyMatchItem[] = tierMatches.map((m: any) => {
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

      // Enqueue grouped urgency alert for each Telegram user
      // Urgency alerts are critical — tender is closing soon
      for (const user of telegramUsers) {
        try {
          await notificationQueue.add(
            `${tierType}-${companyId}-${user.id}-${Date.now()}`,
            {
              telegramChatId: user.telegram_chat_id!,
              type: tierType,
              matches: matchItems,
              totalValor,
            },
            {
              priority: tierType === 'urgency_24h'
                ? NOTIFICATION_PRIORITY.CRITICAL
                : NOTIFICATION_PRIORITY.SUPER_HOT,
            },
          )
          totalUrgencySent++
        } catch (err) {
          logger.debug({ companyId, tier, err }, 'Failed to enqueue urgency notification')
        }
      }

      // Mark urgency sent
      const sentField = tier === 'urgency_24h' ? 'urgency_24h_sent' : 'urgency_48h_sent'
      const matchIds = tierMatches.map((m: any) => m.id)
      await supabase
        .from('matches')
        .update({ [sentField]: true })
        .in('id', matchIds)
    }
  }

  logger.info({ totalUrgencySent }, 'urgency-check job complete')
}

// ─── Job 3: new-matches-digest ──────────────────────────────────────────
async function handleNewMatchesDigest() {
  logger.info('Running new-matches-digest job...')

  const companyUsers = await getCompaniesWithUsers()
  if (companyUsers.size === 0) return

  // Look for matches created in last 3 hours that haven't been notified yet
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
  const today = new Date().toISOString().split('T')[0]
  let totalSent = 0

  for (const [companyId, users] of companyUsers) {
    const telegramUsers = users.filter((u) => u.telegram_chat_id != null)
    if (telegramUsers.length === 0) continue

    // Find new matches (status='new', not yet notified, created recently)
    const { data: matches } = await supabase
      .from('matches')
      .select(`
        id, score, match_source,
        tenders!inner(id, objeto, orgao_nome, uf, municipio, valor_estimado, modalidade_nome, data_encerramento, modalidade_id)
      `)
      .eq('company_id', companyId)
      .eq('status', 'new')
      .gte('score', 60) // Include good matches, not just hot
      .in('match_source', MATCH_SOURCES_FOR_HOT_ALERT)
      .gte('created_at', since)
      .not('tenders.modalidade_id', 'in', `(${EXCLUDED_MODALIDADES.join(',')})`)
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
      .order('score', { ascending: false })
      .limit(10)

    if (!matches || matches.length === 0) continue

    const matchItems: UrgencyMatchItem[] = matches.map((m: any) => {
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
        numero: '',
        ano: '',
      }
    })

    const totalValor = matchItems.reduce((sum, m) => sum + m.valor, 0)

    for (const user of telegramUsers) {
      try {
        await notificationQueue.add(
          `new-matches-${companyId}-${user.id}-${Date.now()}`,
          {
            telegramChatId: user.telegram_chat_id!,
            type: 'new_matches' as const,
            matches: matchItems,
            totalValor,
          },
          {
            priority: NOTIFICATION_PRIORITY.DIGEST,
          },
        )
        totalSent++
      } catch (err) {
        logger.debug({ companyId, err }, 'Failed to enqueue new-matches notification')
      }
    }

    // Mark as notified so they don't get sent again
    const matchIds = matches.map((m: any) => m.id)
    await supabase
      .from('matches')
      .update({ status: 'notified', notified_at: new Date().toISOString() })
      .in('id', matchIds)
      .eq('status', 'new')
  }

  logger.info({ totalSent }, 'new-matches-digest job complete')
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
      case 'new-matches-digest':
        await handleNewMatchesDigest()
        break
      default:
        logger.warn({ jobName: job.name }, 'Unknown hot-alerts job name')
    }
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 600_000,
    stalledInterval: 600_000,
  },
)

hotAlertsWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Hot alerts job failed')
})

export { hotAlertsWorker }
