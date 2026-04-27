import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NotificacoesForm, type NotifPrefs, type ChannelStatus } from './form'

export const dynamic = 'force-dynamic'

const DEFAULT_PREFS: NotifPrefs = {
  preset: 'equilibrado',
  min_score: 55,
  max_per_day: 30,
  quiet_start: '',
  quiet_end: '',
  channels: ['email'],
  engines: ['pgvector_rules', 'keyword'],
  excluded_terms: [],
  daily_digest: true,
}

export default async function NotificacoesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('company_id, email, telegram_chat_id, whatsapp_number, whatsapp_verified')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-2">Notificações</h1>
        <p className="text-muted-foreground">Você precisa estar associado a uma empresa para configurar notificações.</p>
      </div>
    )
  }

  const { data: cfg } = await supabase
    .from('bot_configs')
    .select(
      'notification_preset, min_score_notify, max_notifs_per_day, notif_quiet_start, notif_quiet_end, notif_channels, notif_engines, notif_excluded_terms, daily_digest_enabled',
    )
    .eq('company_id', profile.company_id)
    .eq('portal', '_notifications')
    .maybeSingle()

  const initial: NotifPrefs = cfg
    ? {
        preset: (cfg.notification_preset as NotifPrefs['preset']) || DEFAULT_PREFS.preset,
        min_score: cfg.min_score_notify ?? DEFAULT_PREFS.min_score,
        max_per_day: cfg.max_notifs_per_day ?? DEFAULT_PREFS.max_per_day,
        quiet_start: (cfg.notif_quiet_start as string) || '',
        quiet_end: (cfg.notif_quiet_end as string) || '',
        channels: (cfg.notif_channels as string[]) || DEFAULT_PREFS.channels,
        engines: (cfg.notif_engines as string[]) || DEFAULT_PREFS.engines,
        excluded_terms: (cfg.notif_excluded_terms as string[]) || [],
        daily_digest: cfg.daily_digest_enabled ?? true,
      }
    : DEFAULT_PREFS

  const channelStatus: ChannelStatus = {
    email: Boolean(profile.email),
    telegram: Boolean(profile.telegram_chat_id),
    whatsapp: Boolean(profile.whatsapp_number && profile.whatsapp_verified),
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-semibold">Notificações</h1>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            ✨ Powered by IA
          </span>
        </div>
        <p className="text-muted-foreground text-sm">
          Configure como nossa IA Licitagram filtra e entrega oportunidades nos seus canais.
        </p>
      </header>
      <NotificacoesForm initial={initial} defaults={DEFAULT_PREFS} channelStatus={channelStatus} />
    </div>
  )
}
