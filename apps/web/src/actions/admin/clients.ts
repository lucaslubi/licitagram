'use server'

import { createClient } from '@supabase/supabase-js'
import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { logAction } from './audit'
import { invalidateCompanySubscription } from '@/lib/plans'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function listClients(params?: {
  page?: number
  pageSize?: number
  search?: string
  planSlug?: string
  status?: string
}) {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  const page = params?.page || 1
  const pageSize = params?.pageSize || 20

  let query = supabase
    .from('admin_client_overview')
    .select('*', { count: 'exact' })
    .order('company_created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (params?.search) {
    query = query.or(`razao_social.ilike.%${params.search}%,cnpj.ilike.%${params.search}%,nome_fantasia.ilike.%${params.search}%`)
  }
  if (params?.planSlug) query = query.eq('plan_slug', params.planSlug)
  if (params?.status) query = query.eq('subscription_status', params.status)

  const { data, count, error } = await query

  return {
    clients: data || [],
    count: count || 0,
    totalPages: Math.ceil((count || 0) / pageSize),
    error: error?.message || null,
  }
}

export async function getClientDetail(companyId: string) {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  const [companyResult, subResult, usersResult, matchesResult, plansResult] = await Promise.all([
    supabase.from('companies').select('*').eq('id', companyId).single(),
    supabase.from('subscriptions').select('*, plans(*)').eq('company_id', companyId).single(),
    supabase.from('users').select('id, full_name, email, role, is_active, created_at').eq('company_id', companyId),
    supabase.from('matches').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    supabase.from('plans').select('id, slug, name, price_cents').eq('is_active', true).order('sort_order'),
  ])

  return {
    company: companyResult.data,
    subscription: subResult.data,
    users: usersResult.data || [],
    matchCount: matchesResult.count || 0,
    allPlans: plansResult.data || [],
  }
}

export async function updateClientSubscription(
  companyId: string,
  updates: { status?: string; plan_id?: string },
) {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  const { data: before } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('company_id', companyId)
    .single()

  // If changing plan, also sync the legacy `plan` slug column
  const fullUpdates: Record<string, unknown> = { ...updates }
  if (updates.plan_id) {
    const { data: plan } = await supabase.from('plans').select('slug').eq('id', updates.plan_id).single()
    if (plan) fullUpdates.plan = plan.slug
  }

  const { error } = await supabase
    .from('subscriptions')
    .update(fullUpdates)
    .eq('company_id', companyId)

  if (error) return { error: error.message }

  await invalidateCompanySubscription(companyId)

  await logAction({
    action: 'subscription.updated',
    targetType: 'company',
    targetId: companyId,
    details: { before_status: before?.status, updates: fullUpdates },
  })

  return { success: true }
}
