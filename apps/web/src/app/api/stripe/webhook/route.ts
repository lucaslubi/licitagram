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
          const { data: existing, error: existingErr } = await supabase
            .from('companies')
            .select('id')
            .eq('cnpj', cnpj)
            .maybeSingle()

          if (existingErr) {
            console.error('[stripe-webhook] Error finding company:', existingErr)
            return NextResponse.json({ error: 'DB error' }, { status: 500 })
          }

          let companyId: string
          if (existing) {
            companyId = existing.id
          } else {
            const newId = crypto.randomUUID()
            const { error: insertErr } = await supabase.from('companies').insert({
              id: newId,
              cnpj,
              razao_social: razaoSocial,
              nome_fantasia: nomeFantasia || null,
            })
            if (insertErr) {
              console.error('[stripe-webhook] Error inserting company:', insertErr)
              return NextResponse.json({ error: 'DB error' }, { status: 500 })
            }
            companyId = newId
          }

          // Link to user
          const { error: upsertErr } = await supabase.from('user_companies').upsert(
            { user_id: userId, company_id: companyId, role: 'admin', is_default: false },
            { onConflict: 'user_id,company_id' }
          )
          if (upsertErr) {
            console.error('[stripe-webhook] Error linking user_companies:', upsertErr)
            return NextResponse.json({ error: 'DB error' }, { status: 500 })
          }

          // Increase max_companies on subscription
          const { data: profile, error: profileErr } = await supabase
            .from('users')
            .select('company_id')
            .eq('id', userId)
            .single()

          if (profileErr) {
            console.error('[stripe-webhook] Error fetching profile:', profileErr)
            return NextResponse.json({ error: 'DB error' }, { status: 500 })
          }

          if (profile?.company_id) {
            const { error: rpcErr } = await supabase.rpc('increment_max_companies', { p_company_id: profile.company_id })
            if (rpcErr) {
              console.error('[stripe-webhook] Error incrementing max_companies:', rpcErr)
              return NextResponse.json({ error: 'DB error' }, { status: 500 })
            }
          }

          console.log(`[stripe-webhook] Extra company added: ${cnpj} for user ${userId}`)
        }
        break
      }

      if (userId && planId) {
        const { data: profile, error: profileErr2 } = await supabase
          .from('users')
          .select('company_id')
          .eq('id', userId)
          .single()

        if (profileErr2) {
          console.error('[stripe-webhook] Error fetching profile for subscription:', profileErr2)
          return NextResponse.json({ error: 'DB error' }, { status: 500 })
        }

        if (profile?.company_id) {
          // Fetch the actual Stripe subscription to get the correct status
          // (may be 'trialing' if checkout included a trial period)
          let subStatus = 'active'
          let periodStart = new Date()
          let periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          let expiresAt: string | null = null

          if (session.subscription) {
            try {
              const stripeSub = await stripe.subscriptions.retrieve(session.subscription as string)
              subStatus = stripeSub.status === 'trialing' ? 'trialing' : 'active'
              periodStart = new Date(stripeSub.current_period_start * 1000)
              periodEnd = new Date(stripeSub.current_period_end * 1000)
              if (stripeSub.trial_end) {
                expiresAt = new Date(stripeSub.trial_end * 1000).toISOString()
              }
            } catch (e) {
              console.error('[stripe-webhook] Failed to fetch subscription details:', e)
            }
          }

          const { error: subErr } = await supabase.from('subscriptions').upsert(
            {
              company_id: profile.company_id,
              stripe_subscription_id: session.subscription as string,
              stripe_customer_id: session.customer as string,
              plan_id: planId,
              plan: planSlug || null,  // backward compat
              status: subStatus,
              current_period_start: periodStart.toISOString(),
              current_period_end: periodEnd.toISOString(),
              ...(expiresAt ? { expires_at: expiresAt } : {}),
            },
            { onConflict: 'company_id' },
          )
          if (subErr) {
            console.error('[stripe-webhook] Error upserting subscription:', subErr)
            return NextResponse.json({ error: 'DB error' }, { status: 500 })
          }

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
        const { error: invErr } = await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            current_period_end: new Date(
              Date.now() + 30 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          })
          .eq('stripe_subscription_id', subscriptionId)
        if (invErr) {
          console.error('[stripe-webhook] Error updating subscription on invoice.paid:', invErr)
          return NextResponse.json({ error: 'DB error' }, { status: 500 })
        }
      }
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const { error: delErr } = await supabase
        .from('subscriptions')
        .update({ status: 'canceled' })
        .eq('stripe_subscription_id', subscription.id)
      if (delErr) {
        console.error('[stripe-webhook] Error updating subscription on deletion:', delErr)
        return NextResponse.json({ error: 'DB error' }, { status: 500 })
      }
      break
    }

    case 'invoice.payment_failed': {
      const failedInvoice = event.data.object as unknown as Record<string, unknown>
      const failedSubId = (failedInvoice.subscription as string) || ''
      if (failedSubId) {
        const { error: failErr } = await supabase
          .from('subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_subscription_id', failedSubId)
        if (failErr) {
          console.error('[stripe-webhook] Error updating subscription on payment_failed:', failErr)
          return NextResponse.json({ error: 'DB error' }, { status: 500 })
        }
      }
      break
    }

    case 'customer.subscription.updated': {
      const updatedSub = event.data.object as Stripe.Subscription
      const newStatus = updatedSub.status // 'active', 'trialing', 'past_due', 'canceled', etc.

      // Map Stripe status to our DB status
      const statusMap: Record<string, string> = {
        active: 'active',
        trialing: 'trialing',
        past_due: 'past_due',
        canceled: 'canceled',
        unpaid: 'past_due',
        incomplete: 'past_due',
        incomplete_expired: 'canceled',
      }

      const dbStatus = statusMap[newStatus] || newStatus

      const updateData: Record<string, unknown> = {
        status: dbStatus,
      }

      // Sync billing period dates from Stripe
      const subRaw = updatedSub as any
      if (subRaw.current_period_start) {
        updateData.current_period_start = new Date(subRaw.current_period_start * 1000).toISOString()
      }
      if (subRaw.current_period_end) {
        updateData.current_period_end = new Date(subRaw.current_period_end * 1000).toISOString()
      }

      // If transitioning from trial to active, clear expires_at and update started_at
      const previousStatus = (event.data.previous_attributes as any)?.status
      if (previousStatus === 'trialing' && newStatus === 'active') {
        updateData.expires_at = null
        console.log(`[stripe-webhook] Trial → Active for subscription ${updatedSub.id}`)
      }

      const { error: updateErr } = await supabase
        .from('subscriptions')
        .update(updateData)
        .eq('stripe_subscription_id', updatedSub.id)

      if (updateErr) {
        console.error('[stripe-webhook] Error updating subscription:', updateErr)
        return NextResponse.json({ error: 'DB error' }, { status: 500 })
      }

      // Invalidate plan context cache
      try {
        const { data: subRow } = await supabase
          .from('subscriptions')
          .select('company_id')
          .eq('stripe_subscription_id', updatedSub.id)
          .single()
        if (subRow?.company_id) {
          const { invalidateKey } = await import('@/lib/redis')
          await invalidateKey(`cache:sub:${subRow.company_id}`)
        }
      } catch {
        // Cache invalidation failed — cookie TTL will handle it
      }

      console.log(`[stripe-webhook] Subscription ${updatedSub.id} updated: ${previousStatus || '?'} → ${newStatus}`)
      break
    }

    case 'customer.subscription.trial_will_end': {
      // Stripe fires this 3 days before trial ends
      const trialSub = event.data.object as Stripe.Subscription
      const trialEndDate = trialSub.trial_end
        ? new Date(trialSub.trial_end * 1000).toLocaleDateString('pt-BR')
        : 'em breve'

      console.log(`[stripe-webhook] Trial ending soon for subscription ${trialSub.id} — ends ${trialEndDate}`)

      // Find the user to potentially send them a notification
      const { data: subRow } = await supabase
        .from('subscriptions')
        .select('company_id')
        .eq('stripe_subscription_id', trialSub.id)
        .single()

      if (subRow?.company_id) {
        // Find users linked to this company
        const { data: users } = await supabase
          .from('users')
          .select('id, email, telegram_chat_id, whatsapp_number, whatsapp_verified')
          .eq('company_id', subRow.company_id)

        if (users && users.length > 0) {
          for (const user of users) {
            // Send Telegram notification if available
            if (user.telegram_chat_id) {
              console.log(`[stripe-webhook] Trial ending for user ${user.id} (TG: ${user.telegram_chat_id}) — ${trialEndDate}`)
            }
          }
        }
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
