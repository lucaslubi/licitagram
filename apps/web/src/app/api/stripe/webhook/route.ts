import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(key)
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const stripe = getStripe()
  const supabase = getSupabase()

  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.supabase_user_id
      const planId = session.metadata?.plan_id
      const planSlug = session.metadata?.plan_slug

      // Handle extra company purchase
      if (session.metadata?.type === 'extra_company' && userId) {
        const cnpj = session.metadata.cnpj
        const razaoSocial = session.metadata.razao_social || ''
        const nomeFantasia = session.metadata.nome_fantasia || ''

        if (cnpj) {
          // Create or find company
          const { data: existing } = await supabase
            .from('companies')
            .select('id')
            .eq('cnpj', cnpj)
            .maybeSingle()

          let companyId: string
          if (existing) {
            companyId = existing.id
          } else {
            const newId = crypto.randomUUID()
            await supabase.from('companies').insert({
              id: newId,
              cnpj,
              razao_social: razaoSocial,
              nome_fantasia: nomeFantasia || null,
            })
            companyId = newId
          }

          // Link to user
          await supabase.from('user_companies').upsert(
            { user_id: userId, company_id: companyId, role: 'admin', is_default: false },
            { onConflict: 'user_id,company_id' }
          )

          // Increase max_companies on subscription
          const { data: profile } = await supabase
            .from('users')
            .select('company_id')
            .eq('id', userId)
            .single()

          if (profile?.company_id) {
            await supabase.rpc('increment_max_companies', { p_company_id: profile.company_id })
          }

          console.log(`[stripe-webhook] Extra company added: ${cnpj} for user ${userId}`)
        }
        break
      }

      if (userId && planId) {
        const { data: profile } = await supabase
          .from('users')
          .select('company_id')
          .eq('id', userId)
          .single()

        if (profile?.company_id) {
          await supabase.from('subscriptions').upsert(
            {
              company_id: profile.company_id,
              stripe_subscription_id: session.subscription as string,
              stripe_customer_id: session.customer as string,
              plan_id: planId,
              plan: planSlug || null,  // backward compat
              status: 'active',
              current_period_start: new Date().toISOString(),
              current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            },
            { onConflict: 'company_id' },
          )

          // Invalidate plan context cookie and in-memory cache
          // (Cookie invalidation happens on next middleware request via TTL)
          try {
            const { invalidateKey } = await import('@/lib/redis')
            await invalidateKey(`cache:sub:${profile.company_id}`)
          } catch {
            // Cache invalidation failed — cookie TTL will handle it
          }
        }
      }
      break
    }

    case 'invoice.paid': {
      const invoiceObj = event.data.object as unknown as Record<string, unknown>
      const subscriptionId = (invoiceObj.subscription as string) || ''

      if (subscriptionId) {
        await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            current_period_end: new Date(
              Date.now() + 30 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          })
          .eq('stripe_subscription_id', subscriptionId)
      }
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      await supabase
        .from('subscriptions')
        .update({ status: 'canceled' })
        .eq('stripe_subscription_id', subscription.id)
      break
    }

    case 'invoice.payment_failed': {
      const failedInvoice = event.data.object as unknown as Record<string, unknown>
      const failedSubId = (failedInvoice.subscription as string) || ''
      if (failedSubId) {
        await supabase
          .from('subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_subscription_id', failedSubId)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
