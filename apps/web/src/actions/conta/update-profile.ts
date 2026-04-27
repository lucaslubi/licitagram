'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type UpdateProfileInput = {
  full_name?: string | null
  phone?: string | null
  timezone?: string | null
  language?: string | null
  avatar_url?: string | null
}

const PHONE_DIGITS_RX = /\D+/g
const VALID_LANGS = new Set(['pt-BR', 'en'])

function sanitize(input: unknown): { ok: true; data: UpdateProfileInput } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_payload' }
  const v = input as Record<string, unknown>

  const out: UpdateProfileInput = {}

  if (v.full_name !== undefined) {
    if (v.full_name === null || v.full_name === '') {
      out.full_name = null
    } else if (typeof v.full_name === 'string') {
      const trimmed = v.full_name.trim()
      if (trimmed.length < 2 || trimmed.length > 120) return { ok: false, error: 'invalid_full_name' }
      out.full_name = trimmed
    } else {
      return { ok: false, error: 'invalid_full_name' }
    }
  }

  if (v.phone !== undefined) {
    if (v.phone === null || v.phone === '') {
      out.phone = null
    } else if (typeof v.phone === 'string') {
      const digits = v.phone.replace(PHONE_DIGITS_RX, '')
      if (digits && (digits.length < 10 || digits.length > 15))
        return { ok: false, error: 'invalid_phone' }
      out.phone = digits || null
    } else {
      return { ok: false, error: 'invalid_phone' }
    }
  }

  if (v.timezone !== undefined) {
    if (typeof v.timezone !== 'string' || v.timezone.length > 64) return { ok: false, error: 'invalid_timezone' }
    out.timezone = v.timezone
  }

  if (v.language !== undefined) {
    if (typeof v.language !== 'string' || !VALID_LANGS.has(v.language))
      return { ok: false, error: 'invalid_language' }
    out.language = v.language
  }

  if (v.avatar_url !== undefined) {
    if (v.avatar_url === null || v.avatar_url === '') {
      out.avatar_url = null
    } else if (typeof v.avatar_url === 'string') {
      out.avatar_url = v.avatar_url
    } else {
      return { ok: false, error: 'invalid_avatar_url' }
    }
  }

  return { ok: true, data: out }
}

export async function updateProfile(
  input: UpdateProfileInput,
): Promise<{ success: boolean; error?: string }> {
  const parsed = sanitize(input)
  if (!parsed.ok) return { success: false, error: parsed.error }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'not_authenticated' }

  const updates = parsed.data
  if (Object.keys(updates).length === 0) return { success: true }

  const { error } = await supabase.from('users').update(updates).eq('id', user.id)
  if (error) {
    // Common cause: column missing because Wave 2 migration not applied.
    return { success: false, error: error.message }
  }

  revalidatePath('/conta/perfil')
  revalidatePath('/conta')
  return { success: true }
}
