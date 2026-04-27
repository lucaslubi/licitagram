import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { notificationQueue, NOTIFICATION_PRIORITY } from '../queues/notification.queue'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeeklyActionInsert {
  company_id: string
  week_of: string
  type: string
  priority: 'urgent' | 'high' | 'normal'
  headline: string
  detail: string
  metrics: Array<{ label: string; value: string }>
  action_label?: string
  action_href?: string
  delta_text?: string
  icon_type?: string
}

interface CompanyWithCnaes {
  id: string
  nome_fantasia: string | null
  razao_social: string | null
  cnae_principal: string | null
  cnaes_secundarios: string[] | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.getFullYear(), d.getMonth(), diff)
  return monday.toISOString().split('T')[0]
}

function getCnaeDivisions(company: CompanyWithCnaes): string[] {
  const divs: string[] = []
  if (company.cnae_principal) {
    const d = company.cnae_principal.substring(0, 2)
    if (!divs.includes(d)) divs.push(d)
  }
  if (company.cnaes_secundarios) {
    for (const c of company.cnaes_secundarios) {
      const d = c.substring(0, 2)
      if (!divs.includes(d)) divs.push(d)
    }
  }
  return divs
}

function formatCompact(val: number): string {
  if (val >= 1_000_000_000) return `R$${(val / 1_000_000_000).toFixed(1)}B`
  if (val >= 1_000_000) return `R$${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `R$${(val / 1_000).toFixed(0)}K`
  return `R$${val.toFixed(0)}`
}

// ─── Detection Functions ──────────────────────────────────────────────────────

/**
 * Detect UFs with high edital count and low competitor density.
 * Reuses the same logic from competitors page.tsx line 368.
 */
async function detectOpportunityWindows(
  companyId: string,
  cnaeDivisions: string[],
): Promise<WeeklyActionInsert[]> {
  if (cnaeDivisions.length === 0) return []

  const actions: WeeklyActionInsert[] = []
  const weekOf = getMonday()

  try {
    const { data: stats } = await supabase
      .from('competitor_stats')
      .select('cnpj, uf, total_participacoes, total_vitorias, win_rate, valor_total_ganho, ufs_atuacao')
      .in('cnae_divisao', cnaeDivisions)
      .gte('total_participacoes', 3)
      .limit(500)

    if (!stats || stats.length === 0) return []

    // Aggregate by UF — track unique competitors by CNPJ
    const ufAgg: Record<string, { competitors: Set<string>; editals: number; value: number }> = {}
    for (const s of stats) {
      const ufsObj = (s.ufs_atuacao as Record<string, boolean>) || {}
      for (const uf of Object.keys(ufsObj)) {
        if (!ufAgg[uf]) ufAgg[uf] = { competitors: new Set(), editals: 0, value: 0 }
        ufAgg[uf].competitors.add((s as any).cnpj || s.uf || 'unknown')
        ufAgg[uf].editals += Number(s.total_participacoes || 0)
        ufAgg[uf].value += Number(s.valor_total_ganho || 0)
      }
    }

    // Find UFs with relatively low competition AND meaningful volume
    const windows = Object.entries(ufAgg)
      .filter(([, d]) => d.competitors.size <= 15 && d.editals >= 5)
      .sort((a, b) => {
        // Sort by ratio: editals per competitor (higher = better opportunity)
        const ratioA = a[1].editals / Math.max(a[1].competitors.size, 1)
        const ratioB = b[1].editals / Math.max(b[1].competitors.size, 1)
        return ratioB - ratioA
      })
      .slice(0, 3)

    for (const [uf, data] of windows) {
      actions.push({
        company_id: companyId,
        week_of: weekOf,
        type: 'window',
        priority: data.competitors.size <= 2 ? 'urgent' : 'high',
        headline: `${uf} tem apenas ${data.competitors.size} concorrente${data.competitors.size !== 1 ? 's' : ''} no nicho`,
        detail: `${data.editals} editais identificados com valor total de ${formatCompact(data.value)}. Janela de oportunidade para entrada com baixa competição.`,
        metrics: [
          { label: 'Concorrentes', value: String(data.competitors.size) },
          { label: 'Editais', value: String(data.editals) },
          { label: 'Valor Total', value: formatCompact(data.value) },
        ],
        action_label: `Ver editais de ${uf}`,
        action_href: `/opportunities?uf=${uf}&view=matches`,
        icon_type: 'window',
      })
    }
  } catch (err) {
    logger.error({ err, companyId }, 'Failed to detect opportunity windows')
  }

  return actions
}

/**
 * Detect new competitors that appeared in the last 7 days.
 */
async function detectNewRivals(
  companyId: string,
  cnaeDivisions: string[],
): Promise<WeeklyActionInsert[]> {
  if (cnaeDivisions.length === 0) return []

  const actions: WeeklyActionInsert[] = []
  const weekOf = getMonday()
  const recentWindow = new Date(Date.now() - 30 * 86400000).toISOString()

  try {
    const { data: newCompetitors } = await supabase
      .from('competitor_stats')
      .select('cnpj, razao_social, uf, total_participacoes, win_rate, valor_total_ganho')
      .in('cnae_divisao', cnaeDivisions)
      .gte('ultima_participacao', recentWindow)
      .gte('total_participacoes', 1)
      .order('total_participacoes', { ascending: false })
      .limit(5)

    if (!newCompetitors || newCompetitors.length === 0) return []

    // Check which ones are actually new (not in competitor_relevance yet)
    const cnpjs = newCompetitors.map((c: any) => c.cnpj)
    const { data: existing } = await supabase
      .from('competitor_relevance')
      .select('competitor_cnpj')
      .eq('company_id', companyId)
      .in('competitor_cnpj', cnpjs)

    const existingSet = new Set((existing || []).map((e: any) => e.competitor_cnpj))
    const trulyNew = newCompetitors.filter((c: any) => !existingSet.has(c.cnpj))

    if (trulyNew.length > 0) {
      const topNew = trulyNew[0] as any
      const winRate = Number(topNew.win_rate || 0)
      const winRatePct = winRate > 1 ? winRate : winRate * 100

      actions.push({
        company_id: companyId,
        week_of: weekOf,
        type: 'new_rival',
        priority: trulyNew.length >= 3 ? 'high' : 'normal',
        headline: `${trulyNew.length} novo${trulyNew.length !== 1 ? 's' : ''} concorrente${trulyNew.length !== 1 ? 's' : ''} no nicho`,
        detail: `${(topNew.razao_social || 'N/I').slice(0, 50)} (${topNew.uf || '?'}) entrou com ${topNew.total_participacoes} participações e win rate ${winRatePct.toFixed(1)}%.`,
        metrics: [
          { label: 'Novos', value: String(trulyNew.length) },
          { label: 'Top Win Rate', value: `${winRatePct.toFixed(1)}%` },
        ],
        action_label: 'Ver ranking de rivais',
        action_href: '/competitors?tab=ranking',
        icon_type: 'new_rival',
      })
    }
  } catch (err) {
    logger.error({ err, companyId }, 'Failed to detect new rivals')
  }

  return actions
}

/**
 * Detect rivals whose win rate dropped significantly (weakening).
 */
async function detectWeakeningRivals(
  companyId: string,
  cnaeDivisions: string[],
): Promise<WeeklyActionInsert[]> {
  if (cnaeDivisions.length === 0) return []

  const actions: WeeklyActionInsert[] = []
  const weekOf = getMonday()

  try {
    // Find competitors with many participations but low win rate
    const { data: weakRivals } = await supabase
      .from('competitor_stats')
      .select('cnpj, razao_social, uf, total_participacoes, total_vitorias, win_rate, valor_total_ganho')
      .in('cnae_divisao', cnaeDivisions)
      .gte('total_participacoes', 5)
      .lte('win_rate', 0.30) // less than 30% win rate — struggling competitors
      .order('total_participacoes', { ascending: false })
      .limit(5)

    if (!weakRivals || weakRivals.length === 0) return []

    const top = weakRivals[0] as any
    const winRate = Number(top.win_rate || 0)
    const winRatePct = winRate > 1 ? winRate : winRate * 100

    actions.push({
      company_id: companyId,
      week_of: weekOf,
      type: 'rival_weakness',
      priority: 'normal',
      headline: `${(top.razao_social || 'Concorrente').slice(0, 40)} enfraquecendo`,
      detail: `Win rate de apenas ${winRatePct.toFixed(1)}% com ${top.total_participacoes} participações. Potencial para ganhar mercado neste nicho.`,
      metrics: [
        { label: 'Win Rate', value: `${winRatePct.toFixed(1)}%` },
        { label: 'Participações', value: String(top.total_participacoes) },
      ],
      action_label: 'Analisar concorrente',
      action_href: '/competitors?tab=ranking',
      icon_type: 'rival_weakness',
    })
  } catch (err) {
    logger.error({ err, companyId }, 'Failed to detect weakening rivals')
  }

  return actions
}

// ─── Main Job Handlers ────────────────────────────────────────────────────────

async function handleGenerateWeeklyActions() {
  const weekOf = getMonday()
  logger.info({ weekOf }, 'Generating weekly actions for all companies')

  // Get all companies WITH ACTIVE SUBSCRIPTION
  // Sem isso, weekly_digest era enfileirado pra empresas com trial expirado/canceled
  // e o notification.processor handler de weekly_digest NÃO chama validateNotification
  // (só os de match individual chamam) — então digest vazava pra clientes inativos.
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('company_id, status, expires_at')
    .in('status', ['active', 'trialing'])
    .limit(1000)

  const nowISO = new Date()
  const allowedCompanyIds = new Set<string>()
  for (const sub of subs || []) {
    const expiresAt = sub.expires_at ? new Date(sub.expires_at as string) : null
    if (sub.status === 'trialing' && expiresAt && expiresAt < nowISO) continue
    allowedCompanyIds.add(sub.company_id)
  }

  if (allowedCompanyIds.size === 0) {
    logger.info('No active subscriptions, skipping weekly actions')
    return
  }

  const { data: companies } = await supabase
    .from('companies')
    .select('id, nome_fantasia, razao_social, cnae_principal, cnaes_secundarios')
    .in('id', Array.from(allowedCompanyIds))
    .limit(500)

  if (!companies || companies.length === 0) {
    logger.info('No companies found')
    return
  }

  let totalActions = 0

  for (const company of companies as CompanyWithCnaes[]) {
    try {
      // Check if already generated this week
      const { data: existing } = await supabase
        .from('weekly_actions')
        .select('id')
        .eq('company_id', company.id)
        .eq('week_of', weekOf)
        .limit(1)

      if (existing && existing.length > 0) {
        continue // Already generated
      }

      const cnaeDivisions = getCnaeDivisions(company)
      logger.info({ companyId: company.id, name: company.razao_social, cnaeDivisions }, 'Processing company')

      // Run all detection functions in parallel
      const [windows, newRivals, weakRivals] = await Promise.all([
        detectOpportunityWindows(company.id, cnaeDivisions),
        detectNewRivals(company.id, cnaeDivisions),
        detectWeakeningRivals(company.id, cnaeDivisions),
      ])

      const allActions = [...windows, ...newRivals, ...weakRivals]
      logger.info({ companyId: company.id, windows: windows.length, newRivals: newRivals.length, weakRivals: weakRivals.length, total: allActions.length }, 'Detection results')

      if (allActions.length === 0) continue

      // Persist to weekly_actions table
      const { error: insertErr } = await supabase
        .from('weekly_actions')
        .insert(allActions)

      if (insertErr) {
        logger.error({ err: insertErr, companyId: company.id }, 'Failed to insert weekly actions')
        continue
      }

      totalActions += allActions.length

      // Notify users via Telegram/WhatsApp
      const { data: users } = await supabase
        .from('users')
        .select('id, telegram_chat_id, whatsapp_number')
        .eq('company_id', company.id)

      if (users) {
        for (const user of users) {
          const telegramChatId = user.telegram_chat_id as number | null
          const whatsappNumber = user.whatsapp_number as string | null

          if (telegramChatId || whatsappNumber) {
            const topActions = allActions
              .sort((a, b) => {
                const prio = { urgent: 0, high: 1, normal: 2 }
                return (prio[a.priority] || 2) - (prio[b.priority] || 2)
              })
              .slice(0, 3)
              .map((a) => ({
                id: '',
                type: a.type,
                priority: a.priority,
                headline: a.headline,
                detail: a.detail,
                metrics: a.metrics,
                actionLabel: a.action_label || '',
                actionHref: a.action_href || '',
                deltaText: a.delta_text,
              }))

            await notificationQueue.add(
              `weekly-digest-${company.id}-${user.id}`,
              {
                telegramChatId: telegramChatId || undefined,
                whatsappNumber: whatsappNumber || undefined,
                type: 'weekly_digest' as const,
                actions: topActions,
                companyName: company.nome_fantasia || company.razao_social || 'Empresa',
              },
              { priority: NOTIFICATION_PRIORITY.DIGEST },
            )
          }
        }
      }
    } catch (err) {
      logger.error({ err, companyId: company.id }, 'Failed to generate weekly actions for company')
    }
  }

  logger.info({ totalActions, companies: companies.length }, 'Weekly actions generation complete')
}

async function handleWatchlistActivityCheck() {
  logger.info('Checking watchlist activity')

  // Get all watchlist entries with notify_on_win enabled
  const { data: watchlistEntries } = await supabase
    .from('competitor_watchlist')
    .select('id, company_id, competitor_cnpj, competitor_nome, last_activity_seen_at, notify_on_win')
    .eq('notify_on_win', true)
    .limit(1000)

  if (!watchlistEntries || watchlistEntries.length === 0) return

  let notified = 0

  for (const entry of watchlistEntries) {
    try {
      const lastSeen = entry.last_activity_seen_at || new Date(0).toISOString()

      // Check if competitor won anything since last check
      // competitors.situacao is TEXT — wins use 'Homologado' or 'Informado'
      const { data: recentWins } = await supabase
        .from('competitors')
        .select('tender_id, nome, valor_proposta')
        .eq('cnpj', entry.competitor_cnpj)
        .in('situacao', ['Homologado', 'Informado'])
        .gte('created_at', lastSeen)
        .limit(5)

      if (!recentWins || recentWins.length === 0) continue

      // Update last_activity_seen_at
      await supabase
        .from('competitor_watchlist')
        .update({ last_activity_seen_at: new Date().toISOString() })
        .eq('id', entry.id)

      // Create weekly action
      await supabase
        .from('weekly_actions')
        .insert({
          company_id: entry.company_id,
          week_of: getMonday(),
          type: 'rival_surge',
          priority: 'high',
          headline: `${(entry.competitor_nome || 'Concorrente monitorado').slice(0, 40)} venceu ${recentWins.length} licitação(ões)`,
          detail: `Concorrente da sua watchlist teve atividade recente.`,
          metrics: [
            { label: 'Vitórias Recentes', value: String(recentWins.length) },
          ],
          action_label: 'Ver watchlist',
          action_href: '/competitors?tab=watchlist',
          icon_type: 'rival_surge',
        })

      notified++
    } catch (err) {
      logger.error({ err, watchlistId: entry.id }, 'Failed to check watchlist entry')
    }
  }

  logger.info({ checked: watchlistEntries.length, notified }, 'Watchlist activity check complete')
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export const weeklyActionsWorker = new Worker(
  'weekly-actions',
  async (job) => {
    switch (job.name) {
      case 'generate-weekly-actions':
        await handleGenerateWeeklyActions()
        break
      case 'watchlist-activity-check':
        await handleWatchlistActivityCheck()
        break
      default:
        logger.warn({ jobName: job.name }, 'Unknown weekly-actions job name')
    }
  },
  { connection, concurrency: 1, lockDuration: 600_000, stalledInterval: 600_000 },
)

weeklyActionsWorker.on('completed', (job) => {
  logger.info({ jobName: job.name }, 'Weekly actions job completed')
})

weeklyActionsWorker.on('failed', (job, err) => {
  logger.error({ jobName: job?.name, err: err.message }, 'Weekly actions job failed')
})
