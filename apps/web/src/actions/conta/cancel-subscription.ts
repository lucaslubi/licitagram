'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { revalidatePath } from 'next/cache'

const VALID_REASONS = ['caro', 'nao_usei', 'faltou_feature', 'concorrente', 'outro'] as const
type Reason = (typeof VALID_REASONS)[number]

const VALID_RETENTION = ['discount', 'pause', 'none'] as const
type Retention = (typeof VALID_RETENTION)[number]

export type CancelInput = {
  reason: Reason | string
  reasonDetail?: string
  retentionOffered: Retention | string
  retentionAccepted: boolean
}

export type CancelResult =
  | { success: true; action: 'retention_applied' | 'cancelled_at_period_end'; periodEnd?: string | null }
  | { success: false; error: string }

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function cancelSubscription(input: CancelInput): Promise<CancelResult> {
  if (!VALID_REASONS.includes(input.reason as Reason)) {
    return { success: false, error: 'invalid_reason' }
  }
  if (!VALID_RETENTION.includes(input.retentionOffered as Retention)) {
    return { success: false, error: 'invalid_retention' }
  }

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

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id, current_period_end')
    .eq('company_id', profile.company_id)
    .single()
  if (!sub?.stripe_subscription_id) return { success: false, error: 'no_subscription' }

  // 1. Persist feedback (use service role to be safe re: RLS edge cases)
  const service = getServiceSupabase()
  const { error: feedbackErr } = await service.from('cancellation_feedback').insert({
    company_id: profile.company_id,
    user_id: user.id,
    reason: input.reason,
    reason_detail: input.reasonDetail?.slice(0, 1000) || null,
    retention_offered: input.retentionOffered,
    retention_accepted: !!input.retentionAccepted,
  })
  if (feedbackErr) {
    console.error('[cancelSubscription] feedback insert error:', feedbackErr.message)
    // not fatal — keep going
  }

  // 2. Retention path: apply offer and DON'T cancel
  if (input.retentionAccepted) {
    if (input.retentionOffered === 'discount') {
      try {
        await stripe.subscriptions.update(sub.stripe_subscription_id, {
          discounts: [{ coupon: 'RETAINMENT50' }],
        } as never)
      } catch (e) {
        console.error('[cancelSubscription] coupon error:', (e as Error).message)
        // Coupon may not exist yet on Stripe — log and continue (still treat as retained).
      }
    } else if (input.retentionOffered === 'pause') {
      try {
        await stripe.subscriptions.update(sub.stripe_subscription_id, {
          pause_collection: {
            behavior: 'keep_as_draft',
            resumes_at: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
          },
        })
      } catch (e) {
        console.error('[cancelSubscription] pause error:', (e as Error).message)
      }
    }
    revalidatePath('/conta/assinatura')
    return { success: true, action: 'retention_applied' }
  }

  // 3. Cancel-at-period-end (no immediate access loss)
  try {
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : 'stripe_error'
    console.error('[cancelSubscription] stripe cancel error:', msg)
    return { success: false, error: msg }
  }

  // 4. Mirror state locally (webhook will re-confirm)
  const { error: updErr } = await service
    .from('subscriptions')
    .update({
      cancel_at_period_end: true,
      cancel_requested_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', sub.stripe_subscription_id)

  if (updErr) {
    console.error('[cancelSubscription] subscription update error:', updErr.message)
  }

  revalidatePath('/conta/assinatura')
  return {
    success: true,
    action: 'cancelled_at_period_end',
    periodEnd: sub.current_period_end ?? null,
  }
}

export async function reactivateSubscription(): Promise<{ success: boolean; error?: string }> {
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

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('company_id', profile.company_id)
    .single()
  if (!sub?.stripe_subscription_id) return { success: false, error: 'no_subscription' }

  try {
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: false,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : 'stripe_error'
    console.error('[reactivateSubscription] stripe error:', msg)
    return { success: false, error: msg }
  }

  const service = getServiceSupabase()
  await service
    .from('subscriptions')
    .update({ cancel_at_period_end: false, cancel_requested_at: null })
    .eq('stripe_subscription_id', sub.stripe_subscription_id)

  revalidatePath('/conta/assinatura')
  return { success: true }
}

export async function openStripePortal(): Promise<{ success: boolean; url?: string; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'not_authenticated' }

  const { data: profile } = await supabase
    .from('users')
    .select('company_id, stripe_customer_id')
    .eq('id', user.id)
    .single()
  if (!profile) return { success: false, error: 'no_profile' }

  // Prefer customer id from subscription (canonical source); fallback to user.stripe_customer_id
  let customerId: string | null = profile.stripe_customer_id || null
  if (!customerId && profile.company_id) {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('company_id', profile.company_id)
      .single()
    customerId = sub?.stripe_customer_id || null
  }

  if (!customerId) return { success: false, error: 'no_customer' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://licitagram.com'

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/conta/assinatura`,
    })
    return { success: true, url: session.url }
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : 'stripe_error'
    console.error('[openStripePortal] error:', msg)
    return { success: false, error: msg }
  }
}
