import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || '')
}

export async function POST(request: NextRequest) {
  const stripe = getStripe()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { planId } = (await request.json()) as { planId: string }

  // Look up plan from DB to get stripe_price_id
  const { data: plan, error: planError } = await supabase
    .from('plans')
    .select('id, slug, name, stripe_price_id, is_active')
    .eq('id', planId)
    .single()

  if (planError || !plan || !plan.is_active) {
    return NextResponse.json({ error: 'Invalid or inactive plan' }, { status: 400 })
  }

  if (!plan.stripe_price_id) {
    return NextResponse.json({ error: 'Plan not configured for Stripe payments yet' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

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
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    success_url: `${appUrl}/billing?success=true`,
    cancel_url: `${appUrl}/billing?canceled=true`,
    metadata: {
      supabase_user_id: user.id,
      plan_id: plan.id,
      plan_slug: plan.slug,
    },
  })

  return NextResponse.json({ url: session.url })
}
