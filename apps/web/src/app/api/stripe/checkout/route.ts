import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(key)
}

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let planId: string
    let billing: 'monthly' | 'annual' = 'monthly'
    try {
      const body = await request.json()
      planId = body.planId
      if (body.billing === 'annual') billing = 'annual'
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 })
    }

    // Use service role to bypass RLS on plans table (plans are public data)
    const serviceSupabase = getServiceSupabase()
    const { data: plan, error: planError } = await serviceSupabase
      .from('plans')
      .select('id, slug, name, stripe_price_id, stripe_price_id_annual, is_active')
      .eq('id', planId)
      .single()

    if (planError) {
      console.error('[stripe/checkout] Plan lookup error:', planError.message)
      return NextResponse.json({ error: 'Plano nao encontrado: ' + planError.message }, { status: 400 })
    }

    if (!plan || !plan.is_active) {
      return NextResponse.json({ error: 'Plano invalido ou inativo' }, { status: 400 })
    }

    const priceId = billing === 'annual' && plan.stripe_price_id_annual
      ? plan.stripe_price_id_annual
      : plan.stripe_price_id

    if (!priceId) {
      return NextResponse.json({ error: 'Plano nao configurado para pagamento Stripe' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://licitagram.com'

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from('users')
      .select('stripe_customer_id, email, full_name')
      .eq('id', user.id)
      .single()

    let customerId = profile?.stripe_customer_id as string | null

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email || user.email || '',
        name: (profile?.full_name as string) || '',
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id

      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          supabase_user_id: user.id,
          plan_id: plan.id,
          plan_slug: plan.slug,
        },
      },
      success_url: `${appUrl}/billing?success=true`,
      cancel_url: `${appUrl}/billing?canceled=true`,
      metadata: {
        supabase_user_id: user.id,
        plan_id: plan.id,
        plan_slug: plan.slug,
        billing,
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[stripe/checkout] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
