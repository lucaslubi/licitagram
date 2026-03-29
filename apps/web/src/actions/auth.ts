'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signIn(formData: FormData, redirectTo?: string) {
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
    return { error: error.message }
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
