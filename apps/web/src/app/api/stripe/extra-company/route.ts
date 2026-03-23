import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || '')
}

const EXTRA_COMPANY_PRICE = 19700 // R$197.00 in centavos

export async function POST(request: NextRequest) {
  const stripe = getStripe()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { cnpj, razao_social, nome_fantasia } = await request.json()

  if (!cnpj) {
    return NextResponse.json({ error: 'CNPJ obrigatório' }, { status: 400 })
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('users')
    .select('company_id, stripe_customer_id, email, full_name')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) {
    return NextResponse.json({ error: 'Nenhuma empresa principal' }, { status: 400 })
  }

  // Check subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('id, max_companies, stripe_subscription_id, plans(features)')
    .eq('company_id', profile.company_id)
    .single()

  if (!subscription) {
    return NextResponse.json({ error: 'Assinatura não encontrada' }, { status: 400 })
  }

  const features = (subscription.plans as any)?.features
  if (!features?.multi_cnpj) {
    return NextResponse.json({ error: 'Seu plano não suporta multi-CNPJ' }, { status: 403 })
  }

  // Count existing companies
  const { count } = await supabase
    .from('user_companies')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const maxFree = subscription.max_companies || 1
  const currentCount = count || 0

  // If within free limit, just add directly (no charge)
  if (currentCount < maxFree) {
    return NextResponse.json({
      needsPayment: false,
      message: 'Dentro do limite gratuito. Use a ação padrão.'
    })
  }

  // Beyond limit — create Stripe checkout for extra company
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://licitagram.com'

  // Get or create Stripe customer
  let customerId = profile.stripe_customer_id as string | null
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email || user.email || '',
      name: (profile.full_name as string) || '',
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id
    await supabase
      .from('users')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id)
  }

  // Create or find the extra company price in Stripe
  let priceId = process.env.STRIPE_EXTRA_COMPANY_PRICE_ID

  if (!priceId) {
    // Create product + price on-the-fly
    const product = await stripe.products.create({
      name: 'Licitagram — Empresa Adicional',
      description: `CNPJ adicional no plano Enterprise (além das ${maxFree} incluídas)`,
      metadata: { type: 'extra_company' },
    })

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: EXTRA_COMPANY_PRICE,
      currency: 'brl',
      recurring: { interval: 'month' },
      metadata: { type: 'extra_company' },
    })

    priceId = price.id
    // Log so we can set it as env var later
    console.log(`[stripe] Created extra company price: ${priceId} (set STRIPE_EXTRA_COMPANY_PRICE_ID)`)
  }

  const cleanCnpj = cnpj.replace(/\D/g, '')

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/company?extra_company=success&cnpj=${cleanCnpj}`,
    cancel_url: `${appUrl}/company?extra_company=canceled`,
    metadata: {
      supabase_user_id: user.id,
      type: 'extra_company',
      cnpj: cleanCnpj,
      razao_social: razao_social || '',
      nome_fantasia: nome_fantasia || '',
    },
  })

  return NextResponse.json({ needsPayment: true, url: session.url })
}
