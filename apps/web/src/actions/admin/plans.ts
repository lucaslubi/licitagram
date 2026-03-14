'use server'

import { createClient } from '@supabase/supabase-js'
import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { logAction } from './audit'
import { invalidateAllPlans } from '@/lib/plans'
import type { PlanFeatures } from '@licitagram/shared'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function createPlan(data: {
  slug: string
  name: string
  description?: string
  price_cents: number
  max_matches_per_month: number | null
  max_users: number | null
  max_ai_analyses_per_month: number | null
  max_alerts_per_day: number | null
  extra_user_price_cents?: number
  features: PlanFeatures
  sort_order?: number
}) {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  const { data: plan, error } = await supabase
    .from('plans')
    .insert({
      ...data,
      extra_user_price_cents: data.extra_user_price_cents || 0,
      sort_order: data.sort_order || 0,
      is_active: true,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  await logAction({
    action: 'plan.created',
    targetType: 'plan',
    targetId: plan.id,
    details: { slug: data.slug, name: data.name, price_cents: data.price_cents },
  })

  await invalidateAllPlans()
  return { plan }
}

export async function updatePlan(
  planId: string,
  updates: Partial<{
    name: string
    description: string
    price_cents: number
    stripe_price_id: string
    max_matches_per_month: number | null
    max_users: number | null
    max_ai_analyses_per_month: number | null
    max_alerts_per_day: number | null
    extra_user_price_cents: number
    features: PlanFeatures
    sort_order: number
  }>,
) {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  // Get before state for audit
  const { data: before } = await supabase.from('plans').select('*').eq('id', planId).single()

  const { error } = await supabase
    .from('plans')
    .update(updates)
    .eq('id', planId)

  if (error) return { error: error.message }

  await logAction({
    action: 'plan.updated',
    targetType: 'plan',
    targetId: planId,
    details: { before, updates },
  })

  await invalidateAllPlans()
  return { success: true }
}

export async function togglePlanActive(planId: string, isActive: boolean) {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  const { error } = await supabase
    .from('plans')
    .update({ is_active: isActive })
    .eq('id', planId)

  if (error) return { error: error.message }

  await logAction({
    action: isActive ? 'plan.activated' : 'plan.deactivated',
    targetType: 'plan',
    targetId: planId,
  })

  await invalidateAllPlans()
  return { success: true }
}

export async function getAllPlans() {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .order('sort_order', { ascending: true })

  return { plans: data || [], error: error?.message || null }
}
