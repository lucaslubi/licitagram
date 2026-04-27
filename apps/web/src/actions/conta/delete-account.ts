'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { revalidatePath } from 'next/cache'

const DELETION_GRACE_DAYS = 14

export type DeleteAccountInput = {
  confirmation: string
  email: string
  reason?: string
}

export type DeleteAccountResult =
  | { success: true; scheduledAt: string }
  | { success: false; error: string }

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function deleteAccount(input: DeleteAccountInput): Promise<DeleteAccountResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'not_authenticated' }

  // Confirmação dupla — não negociável
  if (input?.confirmation?.trim() !== 'DELETAR') {
    return { success: false, error: 'invalid_confirmation' }
  }
  const userEmail = (user.email || '').trim().toLowerCase()
  const inputEmail = (input?.email || '').trim().toLowerCase()
  if (!userEmail || inputEmail !== userEmail) {
    return { success: false, error: 'invalid_email' }
  }

  const service = getServiceSupabase()

  // Lê company atual + subscription
  const { data: profile } = await service
    .from('users')
    .select('company_id, deletion_scheduled_at')
    .eq('id', user.id)
    .single()
  const companyId: string | null = profile?.company_id || null

  // Idempotência: se já agendado, retorna sucesso com a data existente
  if (profile?.deletion_scheduled_at) {
    return { success: true, scheduledAt: profile.deletion_scheduled_at }
  }

  const scheduledAt = new Date(Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // 1. Marca soft-delete em users (idempotente — só onde NULL)
  const { error: updErr } = await service
    .from('users')
    .update({
      deletion_scheduled_at: scheduledAt,
      deletion_reason: input.reason || null,
      deletion_cancelled_at: null,
    })
    .eq('id', user.id)
    .is('deletion_scheduled_at', null)
  if (updErr) return { success: false, error: updErr.message }

  // 2. Cancela Stripe IMEDIATAMENTE (não at-period-end)
  if (companyId) {
    try {
      const { data: sub } = await service
        .from('subscriptions')
        .select('stripe_subscription_id')
        .eq('company_id', companyId)
        .maybeSingle()
      if (sub?.stripe_subscription_id) {
        try {
          await stripe.subscriptions.cancel(sub.stripe_subscription_id)
        } catch (stripeErr: any) {
          // Best-effort: log mas não bloqueia (pode já estar cancelada / não existir)
          console.warn('[delete-account] stripe cancel failed:', stripeErr?.message)
        }
        await service
          .from('subscriptions')
          .update({ status: 'canceled' })
          .eq('company_id', companyId)
      }
    } catch (subErr: any) {
      console.warn('[delete-account] subscription lookup failed:', subErr?.message)
    }
  }

  // 3. Audit log
  try {
    await service.from('account_deletion_log').insert({
      user_id: user.id,
      company_id: companyId,
      scheduled_at: scheduledAt,
      reason: input.reason || null,
      metadata: { initiated_via: 'self_service', email: userEmail },
    })
  } catch (logErr: any) {
    console.warn('[delete-account] audit log insert failed:', logErr?.message)
  }

  // 4. Email de confirmação — best-effort. Resend integration TBD;
  // por ora, deixa marcado em metadata e o cron de email envia no próximo
  // ciclo (worker pode ler future). Stub silencioso aqui.
  // TODO(email-resend): integrar com worker notification-email quando
  // o type 'account_deletion_scheduled' estiver disponível no union.

  // 5. Logout
  try {
    await supabase.auth.signOut()
  } catch (signOutErr: any) {
    console.warn('[delete-account] signOut failed:', signOutErr?.message)
  }

  revalidatePath('/conta/privacidade')
  return { success: true, scheduledAt }
}

export type CancelDeletionResult =
  | { success: true }
  | { success: false; error: string }

export async function cancelDeletion(): Promise<CancelDeletionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'not_authenticated' }

  const service = getServiceSupabase()
  const now = new Date().toISOString()

  const { error } = await service
    .from('users')
    .update({
      deletion_cancelled_at: now,
      deletion_scheduled_at: null,
    })
    .eq('id', user.id)
  if (error) return { success: false, error: error.message }

  try {
    await service.from('account_deletion_log').insert({
      user_id: user.id,
      cancelled_at: now,
      metadata: { cancelled_via: 'self_service' },
    })
  } catch (logErr: any) {
    console.warn('[cancel-deletion] audit log failed:', logErr?.message)
  }

  // Email "Conta restaurada" — TODO(email-resend) idem deleteAccount.

  revalidatePath('/conta/privacidade')
  return { success: true }
}
