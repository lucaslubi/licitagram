import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Use fetch directly to Stripe API to avoid SDK connection issues in Vercel
async function stripeRequest(path: string, params: Record<string, string>) {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured')

  const body = new URLSearchParams(params).toString()
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe API error: ${res.status}`)
  }
  return data
}

export async function POST(request: NextRequest) {
  try {
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

    // Use service role to bypass RLS on plans table
    const serviceSupabase = getServiceSupabase()
    const { data: plan, error: planError } = await serviceSupabase
      .from('plans')
      .select('id, slug, name, stripe_price_id, stripe_price_id_annual, is_active')
      .eq('id', planId)
      .single()

    if (planError || !plan || !plan.is_active) {
      return NextResponse.json({ error: 'Plano nao encontrado' }, { status: 400 })
    }

    const priceId = billing === 'annual' && plan.stripe_price_id_annual
      ? plan.stripe_price_id_annual
      : plan.stripe_price_id

    if (!priceId) {
      return NextResponse.json({ error: 'Plano sem preco Stripe configurado' }, { status: 400 })
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
      const customer = await stripeRequest('/customers', {
        email: profile?.email || user.email || '',
        name: (profile?.full_name as string) || '',
        'metadata[supabase_user_id]': user.id,
      })
      customerId = customer.id

      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    // Create checkout session
    const session = await stripeRequest('/checkout/sessions', {
      customer: customerId!,
      mode: 'subscription',
      'payment_method_types[0]': 'card',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'subscription_data[trial_period_days]': '7',
      'subscription_data[metadata][supabase_user_id]': user.id,
      'subscription_data[metadata][plan_id]': plan.id,
      'subscription_data[metadata][plan_slug]': plan.slug,
      success_url: `${appUrl}/billing?success=true`,
      cancel_url: `${appUrl}/billing?canceled=true`,
      'metadata[supabase_user_id]': user.id,
      'metadata[plan_id]': plan.id,
      'metadata[plan_slug]': plan.slug,
      'metadata[billing]': billing,
    })

    if (!session.url) {
      console.error('[stripe/checkout] Session created but no URL:', session.id, 'appUrl:', appUrl)
      return NextResponse.json({ error: 'Sessao criada mas sem URL de redirecionamento' }, { status: 500 })
    }

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[stripe/checkout] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
