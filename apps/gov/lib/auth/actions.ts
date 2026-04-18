'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import {
  forgotPasswordSchema,
  loginSchema,
  mfaChallengeSchema,
  resetPasswordSchema,
  signupSchema,
} from '@/lib/validations/auth'
import { authRateLimit } from '@/lib/rate-limit'
import { headers } from 'next/headers'

type ActionResult = { ok: true } | { ok: false; error: string; field?: string }

function asResult(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    const first = error.issues[0]
    return { ok: false, error: first?.message ?? 'Entrada inválida', field: first?.path?.[0]?.toString() }
  }
  if (error instanceof Error) return { ok: false, error: error.message }
  return { ok: false, error: 'Erro desconhecido' }
}

async function checkRateLimit(action: string): Promise<ActionResult | null> {
  const ip = headers().get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const result = await authRateLimit(`${action}:${ip}`)
  if (!result.success) {
    logger.warn({ action, ip: ip.slice(0, 7) + '***' }, 'auth rate limit hit')
    return { ok: false, error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }
  }
  return null
}

export async function signInAction(formData: FormData): Promise<ActionResult> {
  try {
    const limited = await checkRateLimit('signin')
    if (limited) return limited

    const parsed = loginSchema.parse({
      email: formData.get('email'),
      password: formData.get('password'),
    })
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword(parsed)
    if (error) return { ok: false, error: error.message }

    // If user has MFA enrolled, redirect to challenge.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      redirect('/mfa')
    }
    revalidatePath('/', 'layout')
    redirect('/dashboard')
  } catch (e) {
    if (isRedirectError(e)) throw e
    logger.error({ err: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined }, 'signInAction failed')
    return asResult(e)
  }
}

export async function signUpAction(formData: FormData): Promise<ActionResult> {
  try {
    const limited = await checkRateLimit('signup')
    if (limited) return limited

    const parsed = signupSchema.parse({
      nomeCompleto: formData.get('nomeCompleto'),
      email: formData.get('email'),
      password: formData.get('password'),
      confirmPassword: formData.get('confirmPassword'),
      aceitouTermos: formData.get('aceitouTermos') === 'on' || formData.get('aceitouTermos') === 'true',
    })
    const supabase = createClient()
    const origin =
      headers().get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://gov.licitagram.com'

    const { error } = await supabase.auth.signUp({
      email: parsed.email,
      password: parsed.password,
      options: {
        emailRedirectTo: `${origin}/api/auth/callback`,
        data: { nome_completo: parsed.nomeCompleto },
      },
    })
    if (error) return { ok: false, error: error.message }

    return { ok: true }
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined }, 'signUpAction failed')
    return asResult(e)
  }
}

export async function forgotPasswordAction(formData: FormData): Promise<ActionResult> {
  try {
    const limited = await checkRateLimit('forgot')
    if (limited) return limited

    const { email } = forgotPasswordSchema.parse({ email: formData.get('email') })
    const supabase = createClient()
    const origin =
      headers().get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://gov.licitagram.com'
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/redefinir-senha`,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, 'forgotPasswordAction failed')
    return asResult(e)
  }
}

export async function resetPasswordAction(formData: FormData): Promise<ActionResult> {
  try {
    const { password } = resetPasswordSchema.parse({
      password: formData.get('password'),
      confirmPassword: formData.get('confirmPassword'),
    })
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/', 'layout')
    redirect('/dashboard')
  } catch (e) {
    if (isRedirectError(e)) throw e
    logger.error({ err: e instanceof Error ? e.message : String(e) }, 'resetPasswordAction failed')
    return asResult(e)
  }
}

export async function mfaChallengeAction(formData: FormData): Promise<ActionResult> {
  try {
    const limited = await checkRateLimit('mfa')
    if (limited) return limited

    const { code } = mfaChallengeSchema.parse({ code: formData.get('code') })
    const supabase = createClient()
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()
    if (factorsError) return { ok: false, error: factorsError.message }
    const factor = factors?.totp?.[0]
    if (!factor) return { ok: false, error: 'Nenhum fator MFA cadastrado.' }
    const { data: ch, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id })
    if (challengeError) return { ok: false, error: challengeError.message }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: ch.id,
      code,
    })
    if (verifyError) return { ok: false, error: verifyError.message }
    revalidatePath('/', 'layout')
    redirect('/dashboard')
  } catch (e) {
    if (isRedirectError(e)) throw e
    logger.error({ err: e instanceof Error ? e.message : String(e) }, 'mfaChallengeAction failed')
    return asResult(e)
  }
}

export async function signOutAction(): Promise<void> {
  const supabase = createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

// Next.js throws a special error for redirect() — must be re-thrown so the
// framework handles the navigation instead of swallowing it as a generic error.
function isRedirectError(e: unknown): boolean {
  return (
    e instanceof Error &&
    'digest' in e &&
    typeof (e as { digest?: unknown }).digest === 'string' &&
    ((e as { digest: string }).digest.startsWith('NEXT_REDIRECT') ||
      (e as { digest: string }).digest.startsWith('NEXT_NOT_FOUND'))
  )
}
