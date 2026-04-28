import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { notificationQueue, NOTIFICATION_PRIORITY } from '../queues/notification.queue'
import { whatsappQueue } from '../queues/notification-whatsapp.queue'
import { emailQueue } from '../queues/notification-email.queue'
// IMPORTANTE: lê direto do Supabase canonical, NÃO do mirror PG.
// O mirror está stale desde 2026-03-29 — não tem matches recentes
// (mesmo bug que map_cache teve, fixado em commit 6c90e1b).
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { purgeNonCompetitiveMatches } from '../lib/notification-guard'

/**
 * F-Q5: lightweight fit-flags summary for notification payload.
 * Only computes capital/value flags (in-memory data) — CND checks happen at
 * render time in dashboard via apps/web/src/lib/match/fit-flags.ts.
 * NÃO bloqueia envio — só sinaliza no template.
 */
function computeQuickFitSummary(
  valorEstimado: number | null | undefined,
  capitalSocial: number | null,
  minValor: number | null,
  maxValor: number | null,
): { high: number; medium: number; low: number } {
  let high = 0
  let medium = 0
  let low = 0
  const valor = Number(valorEstimado || 0)
  const capital = Number(capitalSocial || 0)
  if (valor > 0 && capital > 0) {
    const ratio = capital / valor
    if (ratio < 0.05) high++
    else if (ratio < 0.10) medium++
  }
  if (valor > 0) {
    if (maxValor != null && valor > maxValor) low++
    if (minValor != null && valor < minValor) low++
  }
  return { high, medium, low }
}

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
  targetUfs: string[]
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

    // F-Q5: also pull capital_social for fit-flags computation downstream.
    // Defensive select — capital_social may be absent on older schemas.
    let companyRows: Array<Record<string, any>> | null = null
    {
      const withCapital = await supabase
        .from('companies')
        .select('id, min_score, min_valor, max_valor, ufs_interesse, capital_social')
        .in('id', companyIdList)
      if (withCapital.error) {
        const fallback = await supabase
          .from('companies')
          .select('id, min_score, min_valor, max_valor, ufs_interesse')
          .in('id', companyIdList)
        companyRows = (fallback.data as Array<Record<string, any>>) || null
      } else {
        companyRows = (withCapital.data as Array<Record<string, any>>) || null
      }
    }

    const companySettingsMap = new Map<string, any>()
    for (const c of companyRows || []) {
      companySettingsMap.set(c.id, {
        companyId: c.id,
        minScore: c.min_score ?? 50,
        minValor: c.min_valor ?? null,
        maxValor: c.max_valor ?? null,
        targetUfs: (c.ufs_interesse as string[]) || [],
        capitalSocial: c.capital_social ?? null,
      })
    }

    // ── F-Q3: Notification preferences per company (bot_configs portal='_notifications') ──
    // Cliente self-service via /conta/notificacoes. Se não houver row, usa defaults.
    const { data: notifPrefRows } = await supabase
      .from('bot_configs')
      .select(
        'company_id, min_score_notify, max_notifs_per_day, notif_quiet_start, notif_quiet_end, notif_channels, notif_engines, notif_excluded_terms, daily_digest_enabled',
      )
      .eq('portal', '_notifications')
      .in('company_id', companyIdList)

    const notifPrefsByCompany = new Map<string, {
      minScoreNotify: number | null
      maxPerDay: number | null
      quietStart: string | null
      quietEnd: string | null
      channels: string[] | null
      engines: string[] | null
      excludedTerms: string[]
      dailyDigest: boolean
    }>()
    for (const row of notifPrefRows || []) {
      notifPrefsByCompany.set(row.company_id, {
        minScoreNotify: row.min_score_notify ?? null,
        maxPerDay: row.max_notifs_per_day ?? null,
        quietStart: (row.notif_quiet_start as string) || null,
        quietEnd: (row.notif_quiet_end as string) || null,
        channels: (row.notif_channels as string[]) || null,
        engines: (row.notif_engines as string[]) || null,
        excludedTerms: (row.notif_excluded_terms as string[]) || [],
        dailyDigest: row.daily_digest_enabled !== false,
      })
    }

    // Helper: is current UTC time within [start, end] window?
    // Supports overnight (e.g. 22:00 → 06:00).
    function inQuietWindow(start: string | null, end: string | null, ref: Date): boolean {
      if (!start || !end) return false
      const [sh, sm] = start.split(':').map(Number)
      const [eh, em] = end.split(':').map(Number)
      const nowMin = ref.getUTCHours() * 60 + ref.getUTCMinutes()
      const startMin = sh * 60 + sm
      const endMin = eh * 60 + em
      if (startMin === endMin) return false
      return startMin < endMin
        ? nowMin >= startMin && nowMin < endMin
        : nowMin >= startMin || nowMin < endMin
    }

    // Get subscriptions for all companies to know their plan
    // IMPORTANTE: só inclui active + trialing não-vencido. Trial-expirado,
    // canceled, inactive são EXCLUÍDOS daqui → viram set de companies
    // bloqueadas que pulam o loop inteiro abaixo.
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('company_id, plan, status, expires_at')
      .in('company_id', companyIdList)

    const now = new Date()
    const planByCompany = new Map<string, string>()
    const blockedCompanies = new Set<string>()
    for (const sub of subs || []) {
      const isActive = sub.status === 'active'
      const isTrialing = sub.status === 'trialing'
      const expiresAt = sub.expires_at ? new Date(sub.expires_at as string) : null
      const trialExpiredLagged = isTrialing && expiresAt && expiresAt < now

      if ((isActive || isTrialing) && !trialExpiredLagged) {
        planByCompany.set(sub.company_id, sub.plan)
      } else {
        blockedCompanies.add(sub.company_id)
      }
    }
    // Companies sem subscription = bloqueadas também (evita fallback 'free' grátis)
    for (const cid of companyIdList) {
      if (!planByCompany.has(cid)) blockedCompanies.add(cid)
    }
    if (blockedCompanies.size > 0) {
      logger.info(
        { blocked: blockedCompanies.size, total: companyIdList.length },
        'pending-notifications: companies com subscription expirada/inexistente — notificações bloqueadas',
      )
    }

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

    // DEBUG counters (remover quando estabilizar)
    let dbgUsersChecked = 0
    let dbgUsersWithChannel = 0
    let dbgCompaniesChecked = 0
    let dbgCompaniesAfterBlocked = 0
    let dbgQueriesRun = 0
    let dbgMatchesFound = 0
    let dbgMatchesAfterPending = 0
    let dbgMatchesAfterValid = 0

    for (const user of users) {
      dbgUsersChecked++
      const prefs = (user.notification_preferences as Record<string, boolean>) || {}
      const hasTelegram = user.telegram_chat_id && prefs.telegram !== false
      const hasWhatsApp = user.whatsapp_number && user.whatsapp_verified && prefs.whatsapp !== false
      const hasEmail = user.email && prefs.email !== false

      // FIXED: also process users who only have email
      if (!hasTelegram && !hasWhatsApp && !hasEmail) continue
      dbgUsersWithChannel++

      // Get companies this user should receive notifications for
      const enabledCompanies = companiesByUser.get(user.id)
      const companyIdsForUser = (enabledCompanies && enabledCompanies.length > 0)
        ? enabledCompanies
        : (user.company_id ? [user.company_id] : [])

      if (companyIdsForUser.length === 0) continue

      // ── Loop through each company ──
      for (const companyId of companyIdsForUser) {
        dbgCompaniesChecked++
        // Skip companies sem subscription ativa (trial expirado, canceled, sem sub)
        if (blockedCompanies.has(companyId)) continue
        dbgCompaniesAfterBlocked++

        const settings = companySettingsMap.get(companyId) || { companyId, minScore: 50, minValor: null, maxValor: null, targetUfs: [] as string[] }
        const plan = planByCompany.get(companyId) || 'free'
        const batchSize = BATCH_BY_PLAN[plan] || 1
        const minDaily = MIN_DAILY_BY_PLAN[plan] || 1

        // F-Q3: client-tunable notification prefs override company defaults when set.
        const notifPrefs = notifPrefsByCompany.get(companyId)
        const effectiveMinScore = Math.max(
          settings.minScore,
          notifPrefs?.minScoreNotify ?? 0,
        )

        // Quiet window: skip this company entirely if we're inside the silence band.
        if (notifPrefs && inQuietWindow(notifPrefs.quietStart, notifPrefs.quietEnd, now)) {
          logger.debug(
            { companyId, quietStart: notifPrefs.quietStart, quietEnd: notifPrefs.quietEnd },
            'Skipping company — inside notification quiet window',
          )
          continue
        }

        // Daily cap from client prefs (if set), bounded by per-cycle batch logic below.
        const clientDailyCap = notifPrefs?.maxPerDay ?? null

        // Engine allowlist: defaults to existing trusted set if not configured.
        const allowedEngines = new Set<string>(
          notifPrefs?.engines && notifPrefs.engines.length > 0
            ? notifPrefs.engines
            : ['pgvector_rules', 'keyword', 'ai', 'ai_triage', 'semantic'],
        )

        // Channel allowlist (intersection with what the user actually has linked).
        const allowedChannels = new Set<string>(
          notifPrefs?.channels && notifPrefs.channels.length > 0
            ? notifPrefs.channels
            : ['email', 'whatsapp', 'telegram'],
        )

        const excludedTerms = (notifPrefs?.excludedTerms || [])
          .map((t) => t.toLowerCase().trim())
          .filter(Boolean)

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
          .select('id, score, match_source, breakdown, created_at, tenders!inner(data_encerramento, modalidade_id, valor_estimado, uf, objeto, resumo)')
          .eq('company_id', companyId)
          .eq('status', 'new')
          .gte('score', effectiveMinScore)
          .gte('created_at', cutoffDate)
          .is('notified_at', null)
          // data_encerramento NULL é tratado como "ainda aberto" (consistente
          // com map_cache + lista). Filtrar por .gte excluía silenciosamente
          // milhares de matches válidos com data ausente — CIVIL ENGENHARIA
          // tinha 7k+ travados por isso (2026-04-28).
          .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
          .not('tenders.modalidade_id', 'in', '(9,12,14)')
          .order('score', { ascending: false })
          .limit(MAX_NOTIFICATIONS_PER_USER)

        dbgQueriesRun++
        dbgMatchesFound += (allMatches?.length || 0)

        // Quality gate: filter keyword matches without CNAE validation
        const pendingMatches = (allMatches || []).filter((m: any) => {
          // High-quality sources always pass (AI/semantic/pgvector all have semantic understanding).
          // pgvector_rules é o engine determinístico que substituiu ai-triage em 2026-04-21
          // (memory:#3618). Sem ele aqui, notificações de matches pgvector ficavam silenciosas.
          if (['ai', 'ai_triage', 'semantic', 'pgvector_rules'].includes(m.match_source)) return true

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

        dbgMatchesAfterPending += pendingMatches.length
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
          // Geography filter: respect ufs_interesse
          const tenderUf = m.tenders?.uf
          if (settings.targetUfs.length > 0 && tenderUf && !settings.targetUfs.includes(tenderUf)) return false

          // F-Q3: engine allowlist from client prefs.
          if (m.match_source && !allowedEngines.has(m.match_source)) return false

          // F-Q3: excluded keywords (objeto + descricao). Case-insensitive substring match.
          if (excludedTerms.length > 0) {
            const haystack = `${m.tenders?.objeto || ''} ${m.tenders?.resumo || ''}`.toLowerCase()
            if (haystack && excludedTerms.some((t) => haystack.includes(t))) return false
          }

          return true
        })

        dbgMatchesAfterValid += validMatches.length
        if (validMatches.length === 0) continue

        const alreadySent = sentTodayByCompany.get(companyId) || 0

        // F-Q3: respect client-set daily cap. If reached, skip this company for today.
        if (clientDailyCap != null && alreadySent >= clientDailyCap) {
          logger.debug(
            { companyId, alreadySent, clientDailyCap },
            'Skipping company — client daily notification cap reached',
          )
          continue
        }

        const backlogBatch = BACKLOG_BATCH_BY_PLAN[plan] || 5
        let cycleBatch = validMatches.length > 50 ? backlogBatch : batchSize

        if (isLateDay && alreadySent < minDaily) {
          cycleBatch = Math.max(cycleBatch, minDaily - alreadySent)
        }

        // Bound cycle batch by remaining daily budget if client set one.
        if (clientDailyCap != null) {
          cycleBatch = Math.min(cycleBatch, Math.max(0, clientDailyCap - alreadySent))
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

            // F-Q5: quick fit summary in payload (capital/value flags only;
            // CND flags resolved at render time on dashboard).
            const fitSummary = computeQuickFitSummary(
              (match as any).tenders?.valor_estimado as number | null,
              settings.capitalSocial ?? null,
              settings.minValor,
              settings.maxValor,
            )

            if (hasTelegram && allowedChannels.has('telegram')) {
              await notificationQueue.add(
                `tg-${user.id}-${match.id}`,
                {
                  matchId: match.id,
                  telegramChatId: user.telegram_chat_id,
                  fit_flags_summary: fitSummary,
                },
                {
                  jobId: `tg-${user.id}-${match.id}`,
                  priority,
                },
              )
            }

            if (hasWhatsApp && allowedChannels.has('whatsapp')) {
              await whatsappQueue.add(
                `wa-${user.id}-${match.id}`,
                {
                  matchId: match.id,
                  whatsappNumber: user.whatsapp_number,
                  fit_flags_summary: fitSummary,
                },
                {
                  jobId: `wa-${user.id}-${match.id}`,
                  priority,
                },
              )
            }

            // Email notifications
            if (hasEmail && allowedChannels.has('email')) {
              await emailQueue.add(
                `em-${user.id}-${match.id}`,
                {
                  matchId: match.id,
                  userEmail: user.email,
                  userId: user.id,
                  fit_flags_summary: fitSummary,
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

    logger.info({
      totalEnqueued,
      dbg: {
        usersChecked: dbgUsersChecked,
        usersWithChannel: dbgUsersWithChannel,
        companiesChecked: dbgCompaniesChecked,
        companiesAfterBlocked: dbgCompaniesAfterBlocked,
        queriesRun: dbgQueriesRun,
        matchesFound: dbgMatchesFound,
        matchesAfterPending: dbgMatchesAfterPending,
        matchesAfterValid: dbgMatchesAfterValid,
      },
    }, 'Pending notifications check complete')
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
