import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  // Handle Supabase error params (e.g. expired link)
  if (error) {
    const msg = errorDescription || 'Erro ao confirmar email. Tente fazer login novamente.'
    return NextResponse.redirect(`${origin}/login?message=${encodeURIComponent(msg)}&type=error`)
  }

  if (code) {
    const supabase = await createClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (!exchangeError) {
      // ── Ensure trial subscription exists for users with a company ──────
      // This catches users who confirmed their email after onboarding
      // but somehow ended up without a subscription (e.g. race condition,
      // trigger failure, etc.).
      try {
        await ensureTrialSubscription(supabase)
      } catch (err) {
        console.error('[Auth Callback] ensureTrialSubscription error:', err)
        // Don't block login — trial creation is best-effort here
      }

      return NextResponse.redirect(`${origin}/map`)
    }
    console.error('[Auth Callback] Exchange error:', exchangeError.message)
    // Common case: link expired or already used
    const msg = exchangeError.message.includes('expired')
      ? 'Link de confirmação expirado. Tente fazer login — um novo email será enviado.'
      : 'Erro ao confirmar email. Tente fazer login novamente.'
    return NextResponse.redirect(`${origin}/login?message=${encodeURIComponent(msg)}&type=error`)
  }

  return NextResponse.redirect(`${origin}/login?message=${encodeURIComponent('Link inválido. Tente fazer login novamente.')}&type=error`)
}

/**
 * Ensure user has a trial subscription if they have a company but no subscription.
 * Uses service role to bypass RLS for the subscription insert.
 */
async function ensureTrialSubscription(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) return // No company yet — trial will be created when company is created

  // Check if subscription already exists for this company
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('company_id', profile.company_id)
    .limit(1)
    .maybeSingle()

  if (existingSub) return // Already has a subscription

  // Create trial subscription using service role (bypasses RLS)
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const now = new Date()
  const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const { error: insertError } = await serviceSupabase.from('subscriptions').insert({
    company_id: profile.company_id,
    plan: 'trial',
    plan_id: null,
    status: 'trialing',
    started_at: now.toISOString(),
    expires_at: trialEnd.toISOString(),
    current_period_start: now.toISOString(),
    current_period_end: trialEnd.toISOString(),
    matches_used_this_month: 0,
    matches_reset_at: now.toISOString(),
  })

  if (insertError) {
    // 23505 = unique constraint violation — subscription already exists (race condition)
    if (insertError.code !== '23505') {
      console.error('[Auth Callback] Trial subscription insert error:', insertError.message)
    }
  } else {
    console.log('[Auth Callback] Created trial subscription for company:', profile.company_id)
  }
}
