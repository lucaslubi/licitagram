/**
 * Channel Onboarding Processor
 *
 * Triggered when a user activates a notification channel for the first time
 * (WhatsApp verified, Telegram /start, etc.). Decides between:
 *
 * - **TRIAL WOW**: company has never been notified → send up to 50 fresh quality
 *   matches (`status='new'`, score >= minScore) to create a strong first impression.
 *
 * - **BACKFILL**: company already received notifications on another channel → resend
 *   the full history of already-notified matches to the new channel so the client has
 *   continuity. Does NOT touch `notified_at` (preserves the original record).
 *
 * Both flows enqueue jobs into the channel-specific notification queue in **score
 * ASCENDING order** so the highest-score matches arrive last and land at the top of
 * the user's inbox (best opportunities most visible).
 *
 * The processor records `users.<channel>_onboarded_at` so the burst runs exactly once
 * per user per channel.
 */
import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import { db } from '../lib/db'
import { logger } from '../lib/logger'
import { whatsappQueue } from '../queues/notification-whatsapp.queue'
import { telegramQueue } from '../queues/notification-telegram.queue'
import {
  channelOnboardingQueue,
  type ChannelOnboardingJobData,
  type ChannelOnboardingChannel,
} from '../queues/channel-onboarding.queue'
import { sendWhatsAppText } from '../whatsapp/client'

const MAX_TRIAL_BURST = 50
const MAX_BACKFILL = 200
const MIN_SCORE_TRIAL = 60
const MIN_SCORE_BACKFILL = 50

interface MinimalUser {
  id: string
  company_id: string | null
  whatsapp_number: string | null
  whatsapp_verified: boolean | null
  whatsapp_onboarded_at: string | null
  telegram_chat_id: number | null
  telegram_onboarded_at: string | null
  email_onboarded_at: string | null
}

interface MinimalMatch {
  id: string
  score: number
  notified_at: string | null
  tenders: { uf: string | null; data_encerramento: string | null } | null
}

function onboardedColumn(channel: ChannelOnboardingChannel): keyof MinimalUser {
  if (channel === 'whatsapp') return 'whatsapp_onboarded_at'
  if (channel === 'telegram') return 'telegram_onboarded_at'
  return 'email_onboarded_at'
}

async function sendIntroMessage(
  channel: ChannelOnboardingChannel,
  user: MinimalUser,
  flow: 'trial' | 'backfill',
  count: number,
): Promise<void> {
  const trialText =
    `🎁 *Bem-vindo ao Licitagram!*\n\n` +
    `Encontramos *${count} oportunidades de qualidade* compatíveis com o perfil da sua empresa.\n\n` +
    `Vamos enviar todas elas agora — fique de olho nos próximos minutos. As melhores oportunidades aparecem por último (no topo da sua conversa).\n\n` +
    `A partir de agora, você receberá *automaticamente* todos os novos editais relevantes assim que forem publicados.\n\n` +
    `_Equipe Licitagram_`

  const backfillText =
    `📥 *Histórico de oportunidades*\n\n` +
    `Você acabou de conectar este canal. Vamos reenviar aqui as *${count} oportunidades* que já encontramos para sua empresa, para que você tenha o histórico completo.\n\n` +
    `A partir de agora, você também receberá todos os novos editais relevantes por aqui.\n\n` +
    `_Equipe Licitagram_`

  const text = flow === 'trial' ? trialText : backfillText

  if (channel === 'whatsapp' && user.whatsapp_number) {
    await sendWhatsAppText(user.whatsapp_number, text)
  } else if (channel === 'telegram' && user.telegram_chat_id) {
    const { bot } = await import('../telegram/bot')
    if (!bot) return
    await bot.api.sendMessage(user.telegram_chat_id, text, { parse_mode: 'Markdown' })
  }
}

async function sendUpgradeCTA(
  channel: ChannelOnboardingChannel,
  user: MinimalUser,
): Promise<void> {
  const text =
    `✨ *Quer ainda mais?*\n\n` +
    `O *Plano Enterprise* libera:\n` +
    `• Alertas em tempo real (assim que o edital é publicado)\n` +
    `• Limite ilimitado de notificações\n` +
    `• Múltiplos usuários por empresa\n` +
    `• Análise IA aprofundada\n` +
    `• Suporte prioritário\n\n` +
    `Faça o upgrade direto no app: *Planos > Enterprise > Contratar*. É só um clique.\n\n` +
    `_Equipe Licitagram_`

  if (channel === 'whatsapp' && user.whatsapp_number) {
    await sendWhatsAppText(user.whatsapp_number, text)
  } else if (channel === 'telegram' && user.telegram_chat_id) {
    const { bot } = await import('../telegram/bot')
    if (!bot) return
    await bot.api.sendMessage(user.telegram_chat_id, text, { parse_mode: 'Markdown' })
  }
}

/**
 * Enqueue match notification jobs for the target channel in score ASC order
 * (lowest first, highest last → highest lands at top of inbox).
 */
async function enqueueMatches(
  channel: ChannelOnboardingChannel,
  user: MinimalUser,
  matches: MinimalMatch[],
  flow: 'trial' | 'backfill',
): Promise<number> {
  // Sort ASC so the highest score is the LAST job added → arrives last → top of inbox
  const sorted = [...matches].sort((a, b) => a.score - b.score)
  const ts = Date.now()
  let n = 0

  for (const m of sorted) {
    const jobId = `onb-${flow}-${channel}-${user.id}-${ts}-${m.id}`
    if (channel === 'whatsapp' && user.whatsapp_number) {
      await whatsappQueue.add(
        jobId,
        { matchId: m.id, whatsappNumber: user.whatsapp_number },
        { jobId },
      )
      n++
    } else if (channel === 'telegram' && user.telegram_chat_id) {
      await telegramQueue.add(
        jobId,
        { matchId: m.id, telegramChatId: user.telegram_chat_id },
        { jobId },
      )
      n++
    }
  }
  return n
}

export async function runChannelOnboarding(
  userId: string,
  channel: ChannelOnboardingChannel,
): Promise<{ flow: 'skipped' | 'trial' | 'backfill'; count: number; reason?: string }> {
  const { data: user, error: userErr } = await db
    .from('users')
    .select(
      'id, company_id, whatsapp_number, whatsapp_verified, whatsapp_onboarded_at, telegram_chat_id, telegram_onboarded_at, email_onboarded_at',
    )
    .eq('id', userId)
    .single()

  if (userErr || !user) {
    logger.warn({ userId, channel, err: userErr }, 'Onboarding: user not found')
    return { flow: 'skipped', count: 0, reason: 'user_not_found' }
  }

  const u = user as MinimalUser

  // Already onboarded for this channel — skip (anti-duplication)
  const col = onboardedColumn(channel)
  if (u[col]) {
    logger.info({ userId, channel }, 'Onboarding: already done, skipping')
    return { flow: 'skipped', count: 0, reason: 'already_onboarded' }
  }

  // Channel must be active for this user
  if (channel === 'whatsapp' && (!u.whatsapp_number || !u.whatsapp_verified)) {
    return { flow: 'skipped', count: 0, reason: 'channel_inactive' }
  }
  if (channel === 'telegram' && !u.telegram_chat_id) {
    return { flow: 'skipped', count: 0, reason: 'channel_inactive' }
  }

  if (!u.company_id) {
    return { flow: 'skipped', count: 0, reason: 'no_company' }
  }

  // Decide flow: TRIAL WOW (no prior notifications) vs BACKFILL (history exists)
  const { count: priorNotifiedCount } = await db
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', u.company_id)
    .not('notified_at', 'is', null)
    .limit(1)

  const flow: 'trial' | 'backfill' = (priorNotifiedCount || 0) === 0 ? 'trial' : 'backfill'

  // Fetch matches according to flow
  const now = new Date().toISOString()
  let matches: MinimalMatch[] = []

  if (flow === 'trial') {
    const { data } = await db
      .from('matches')
      .select('id, score, notified_at, tenders!inner(uf, data_encerramento)')
      .eq('company_id', u.company_id)
      .eq('status', 'new')
      .gte('score', MIN_SCORE_TRIAL)
      .is('notified_at', null)
      .order('score', { ascending: false })
      .limit(MAX_TRIAL_BURST * 2) // overshoot, will filter
    matches = (data as unknown as MinimalMatch[]) || []
  } else {
    const { data } = await db
      .from('matches')
      .select('id, score, notified_at, tenders!inner(uf, data_encerramento)')
      .eq('company_id', u.company_id)
      .gte('score', MIN_SCORE_BACKFILL)
      .not('notified_at', 'is', null)
      .order('score', { ascending: false })
      .limit(MAX_BACKFILL * 2)
    matches = (data as unknown as MinimalMatch[]) || []
  }

  // Filter: tender must have UF + not be expired
  const valid = matches.filter((m) => {
    const t = m.tenders
    if (!t || !t.uf) return false
    if (t.data_encerramento && t.data_encerramento < now) return false
    return true
  })

  const cap = flow === 'trial' ? MAX_TRIAL_BURST : MAX_BACKFILL
  const selected = valid.slice(0, cap)

  logger.info(
    { userId, channel, flow, candidates: matches.length, valid: valid.length, selected: selected.length },
    'Onboarding: matches selected',
  )

  if (selected.length === 0) {
    // Mark as onboarded anyway so we don't keep retrying
    await db.from('users').update({ [col]: now }).eq('id', userId)
    logger.info({ userId, channel, flow }, 'Onboarding: no matches to send, marked as done')
    return { flow, count: 0, reason: 'no_matches' }
  }

  // 1) Intro message
  try {
    await sendIntroMessage(channel, u, flow, selected.length)
  } catch (err) {
    logger.error({ userId, channel, err }, 'Onboarding: intro message failed')
  }

  // 2) Match jobs
  const enqueued = await enqueueMatches(channel, u, selected, flow)

  // 3) Upgrade CTA (sent after a short delay so it lands AFTER all matches in the inbox)
  try {
    setTimeout(() => {
      sendUpgradeCTA(channel, u).catch((err) =>
        logger.error({ userId, channel, err }, 'Onboarding: CTA failed'),
      )
    }, Math.max(15_000, selected.length * 1100))
  } catch (err) {
    logger.error({ userId, channel, err }, 'Onboarding: CTA scheduling failed')
  }

  // 4) Mark as onboarded
  await db.from('users').update({ [col]: now }).eq('id', userId)

  logger.info(
    { userId, channel, flow, enqueued },
    flow === 'trial' ? '🎁 Trial WOW dispatched' : '📥 Channel backfill dispatched',
  )

  return { flow, count: enqueued }
}

export const channelOnboardingWorker = new Worker<ChannelOnboardingJobData>(
  'channel-onboarding',
  async (job) => {
    const { userId, channel } = job.data
    logger.info({ userId, channel }, 'Channel onboarding job received')
    return runChannelOnboarding(userId, channel)
  },
  {
    connection,
    concurrency: 2,
    lockDuration: 600_000,
    stalledInterval: 600_000,
  },
)

channelOnboardingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, data: job?.data, err }, 'Channel onboarding job failed')
})

export { channelOnboardingQueue }
