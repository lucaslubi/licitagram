'use server'

import { createClient } from '@/lib/supabase/server'

export type ChangePasswordInput = {
  current_password: string
  new_password: string
}

export type ChangePasswordResult = {
  success: boolean
  error?: 'invalid_payload' | 'invalid_current_password' | 'weak_password' | 'not_authenticated' | 'update_failed' | string
}

const PASSWORD_RULES = {
  minLength: 8,
  upper: /[A-Z]/,
  digit: /[0-9]/,
  special: /[^A-Za-z0-9]/,
}

export function validatePasswordRules(pwd: string): { ok: boolean; failed?: string[] } {
  const failed: string[] = []
  if (pwd.length < PASSWORD_RULES.minLength) failed.push('minLength')
  if (!PASSWORD_RULES.upper.test(pwd)) failed.push('upper')
  if (!PASSWORD_RULES.digit.test(pwd)) failed.push('digit')
  if (!PASSWORD_RULES.special.test(pwd)) failed.push('special')
  return failed.length ? { ok: false, failed } : { ok: true }
}

export async function changePassword(input: ChangePasswordInput): Promise<ChangePasswordResult> {
  if (!input || typeof input.current_password !== 'string' || typeof input.new_password !== 'string') {
    return { success: false, error: 'invalid_payload' }
  }

  const rules = validatePasswordRules(input.new_password)
  if (!rules.ok) return { success: false, error: 'weak_password' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) return { success: false, error: 'not_authenticated' }

  // Verify current password by attempting sign-in (does not change session for current client
  // because we re-use existing cookies; the call may rotate refresh tokens but stays logged in).
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: input.current_password,
  })
  if (verifyErr) {
    return { success: false, error: 'invalid_current_password' }
  }

  // Update password using the user-context client (no service role needed).
  const { error: updateErr } = await supabase.auth.updateUser({ password: input.new_password })
  if (updateErr) {
    return { success: false, error: updateErr.message || 'update_failed' }
  }

  return { success: true }
}
