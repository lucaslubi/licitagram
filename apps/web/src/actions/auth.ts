'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

export async function signIn(formData: FormData, redirectTo?: string) {
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = await checkRateLimit(`auth-signIn:${ip}`, 5, 60)
  if (!rl.allowed) {
    return { error: 'Muitas tentativas. Tente novamente em alguns segundos.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect(redirectTo || '/map')
}

export async function signUp(formData: FormData, redirectTo?: string) {
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = await checkRateLimit(`auth-signUp:${ip}`, 5, 60)
  if (!rl.allowed) {
    return { error: 'Muitas tentativas. Tente novamente em alguns segundos.' }
  }

  const supabase = await createClient()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://licitagram.com'

  const { data, error } = await supabase.auth.signUp({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    options: {
      data: {
        full_name: formData.get('full_name') as string,
      },
      emailRedirectTo: `${appUrl}/auth/callback`,
    },
  })

  if (error) {
    // Supabase returns "User already registered" for duplicate emails
    const isDuplicate =
      error.message.toLowerCase().includes('user already registered') ||
      error.message.toLowerCase().includes('already registered') ||
      error.message.toLowerCase().includes('already in use')
    if (isDuplicate) {
      return {
        error:
          'Este email já está associado a uma conta. Cada email só pode ser usado em uma conta. Se você já tem acesso ao Licitagram, faça login normalmente.',
      }
    }
    return { error: error.message }
  }

  // Supabase silently returns a user with empty identities when email confirmations
  // are enabled and the email is already registered (avoids leaking user existence).
  // Detect this case and block the duplicate signup gracefully.
  if (data.user && data.user.identities?.length === 0) {
    return {
      error:
        'Este email já está associado a uma conta. Cada email só pode ser usado em uma conta. Se você já tem acesso ao Licitagram, faça login normalmente.',
    }
  }

  // If email confirmation is required, Supabase returns a user with identities
  // but no active session. Don't redirect to dashboard — show confirmation message.
  const needsConfirmation = data.user && !data.session
  if (needsConfirmation) {
    return { success: 'Verifique seu email para confirmar o cadastro.' }
  }

  // If email confirmation is disabled in Supabase, user is already logged in
  revalidatePath('/', 'layout')
  redirect(redirectTo || '/map')
}

export async function signInWithGoogle() {
  const supabase = await createClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://licitagram.com'

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${appUrl}/auth/callback`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })

  if (error) {
    return { error: error.message }
  }

  if (data.url) {
    redirect(data.url)
  }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function requestPasswordReset(formData: FormData) {
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = await checkRateLimit(`auth-forgot:${ip}`, 5, 60)
  if (!rl.allowed) {
    return { error: 'Muitas tentativas. Tente novamente em alguns minutos.' }
  }

  const email = (formData.get('email') as string | null)?.trim().toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'Informe um email válido.' }
  }

  const supabase = await createClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://licitagram.com'

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/callback?next=/reset-password`,
  })
  if (error) {
    return { error: error.message }
  }
  return { success: 'Se houver uma conta com esse email, enviamos um link para redefinir a senha.' }
}

export async function updatePassword(formData: FormData) {
  const password = (formData.get('password') as string | null) ?? ''
  const confirm = (formData.get('confirm') as string | null) ?? ''

  if (password.length < 8) {
    return { error: 'A nova senha precisa ter ao menos 8 caracteres.' }
  }
  if (password !== confirm) {
    return { error: 'As senhas não conferem.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  redirect('/map')
}
