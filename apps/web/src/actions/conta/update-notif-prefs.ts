'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const PRESETS = ['alta_qualidade', 'equilibrado', 'tudo', 'custom'] as const
const VALID_CHANNELS = ['email', 'whatsapp', 'telegram', 'push']
const VALID_ENGINES = ['pgvector_rules', 'keyword', 'semantic']
const TIME_RX = /^\d{2}:\d{2}$/

export type NotifPrefsInput = {
  preset: (typeof PRESETS)[number]
  min_score: number
  max_per_day: number
  quiet_start: string
  quiet_end: string
  channels: string[]
  engines: string[]
  excluded_terms: string[]
  daily_digest: boolean
}

function validate(raw: any): { ok: true; data: NotifPrefsInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid_payload' }
  const v = raw as Record<string, any>
  if (!PRESETS.includes(v.preset)) return { ok: false, error: 'invalid_preset' }
  const min_score = Number(v.min_score)
  if (!Number.isInteger(min_score) || min_score < 40 || min_score > 100)
    return { ok: false, error: 'invalid_min_score' }
  const max_per_day = Number(v.max_per_day)
  if (!Number.isInteger(max_per_day) || max_per_day < 1 || max_per_day > 200)
    return { ok: false, error: 'invalid_max_per_day' }
  const quiet_start = typeof v.quiet_start === 'string' ? v.quiet_start : ''
  const quiet_end = typeof v.quiet_end === 'string' ? v.quiet_end : ''
  if (quiet_start && !TIME_RX.test(quiet_start)) return { ok: false, error: 'invalid_quiet_start' }
  if (quiet_end && !TIME_RX.test(quiet_end)) return { ok: false, error: 'invalid_quiet_end' }
  const channels = Array.isArray(v.channels) ? v.channels.filter((c) => VALID_CHANNELS.includes(c)) : []
  if (channels.length < 1) return { ok: false, error: 'channels_required' }
  const engines = Array.isArray(v.engines) ? v.engines.filter((e) => VALID_ENGINES.includes(e)) : []
  if (engines.length < 1) return { ok: false, error: 'engines_required' }
  const excluded_terms = Array.isArray(v.excluded_terms)
    ? v.excluded_terms.filter((t: any) => typeof t === 'string' && t.trim()).map((t: string) => t.trim())
    : []
  const daily_digest = Boolean(v.daily_digest)
  return {
    ok: true,
    data: { preset: v.preset, min_score, max_per_day, quiet_start, quiet_end, channels, engines, excluded_terms, daily_digest },
  }
}

export async function updateNotifPrefs(input: unknown): Promise<{ success: boolean; error?: string }> {
  const parsed = validate(input)
  if (!parsed.ok) return { success: false, error: parsed.error }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'not_authenticated' }

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (!profile?.company_id) return { success: false, error: 'no_company' }

  const v = parsed.data
  const { error } = await supabase.from('bot_configs').upsert(
    {
      company_id: profile.company_id,
      portal: '_notifications',
      notification_preset: v.preset,
      min_score_notify: v.min_score,
      max_notifs_per_day: v.max_per_day,
      notif_quiet_start: v.quiet_start || null,
      notif_quiet_end: v.quiet_end || null,
      notif_channels: v.channels,
      notif_engines: v.engines,
      notif_excluded_terms: v.excluded_terms,
      daily_digest_enabled: v.daily_digest,
    },
    { onConflict: 'company_id,portal' },
  )

  if (error) return { success: false, error: error.message }
  revalidatePath('/conta/notificacoes')
  return { success: true }
}
