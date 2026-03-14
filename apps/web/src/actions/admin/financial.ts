'use server'

import { createClient } from '@supabase/supabase-js'
import { requirePlatformAdmin } from '@/lib/auth-helpers'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function getRevenueMetrics() {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  // MRR: SUM of active plan prices
  const { data: mrrData } = await supabase
    .from('subscriptions')
    .select('plans(price_cents)')
    .in('status', ['active', 'trialing'])

  const mrr = (mrrData || []).reduce((sum, sub) => {
    const plan = (sub as any).plans
    return sum + (plan?.price_cents || 0)
  }, 0)

  // Subscription counts by status
  const { data: statusCounts } = await supabase
    .from('subscriptions')
    .select('status')

  const statusMap: Record<string, number> = {}
  for (const sub of statusCounts || []) {
    statusMap[sub.status] = (statusMap[sub.status] || 0) + 1
  }

  // Revenue by plan
  const { data: revenueByPlan } = await supabase
    .from('subscriptions')
    .select('plans(slug, name, price_cents)')
    .in('status', ['active', 'trialing'])

  const planRevenue: Record<string, { name: string; count: number; revenue: number }> = {}
  for (const sub of revenueByPlan || []) {
    const plan = (sub as any).plans
    if (plan?.slug) {
      if (!planRevenue[plan.slug]) {
        planRevenue[plan.slug] = { name: plan.name, count: 0, revenue: 0 }
      }
      planRevenue[plan.slug].count++
      planRevenue[plan.slug].revenue += plan.price_cents
    }
  }

  return {
    mrr,
    arr: mrr * 12,
    statusCounts: statusMap,
    revenueByPlan: planRevenue,
  }
}

export async function getDelinquents() {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  const { data } = await supabase
    .from('subscriptions')
    .select('*, companies(cnpj, razao_social), plans(name)')
    .eq('status', 'past_due')
    .order('updated_at', { ascending: false })

  return { delinquents: data || [] }
}
