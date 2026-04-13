'use server'

import { createClient } from '@supabase/supabase-js'
import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { sanitizePostgrestFilterValue } from '@/lib/utils'
import { logAction } from './audit'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function listUsers(params?: {
  page?: number
  pageSize?: number
  search?: string
  companyId?: string
  role?: string
  isActive?: boolean
}) {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  const page = params?.page || 1
  const pageSize = params?.pageSize || 30

  let query = supabase
    .from('users')
    .select('id, full_name, email, role, is_active, is_platform_admin, company_id, plan_id, subscription_status, created_at, plans(slug, name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (params?.search) {
    const safe = sanitizePostgrestFilterValue(params.search)
    query = query.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`)
  }
  if (params?.companyId) query = query.eq('company_id', params.companyId)
  if (params?.role) query = query.eq('role', params.role)
  if (params?.isActive !== undefined) query = query.eq('is_active', params.isActive)

  const { data, count, error } = await query

  return {
    users: data || [],
    count: count || 0,
    totalPages: Math.ceil((count || 0) / pageSize),
    error: error?.message || null,
  }
}

export async function toggleUserActive(userId: string, isActive: boolean) {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  const { error } = await supabase
    .from('users')
    .update({ is_active: isActive })
    .eq('id', userId)

  if (error) return { error: error.message }

  await logAction({
    action: isActive ? 'user.activated' : 'user.deactivated',
    targetType: 'user',
    targetId: userId,
  })

  return { success: true }
}

export async function updateUserRole(userId: string, role: 'admin' | 'user' | 'viewer') {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  const { error } = await supabase
    .from('users')
    .update({ role })
    .eq('id', userId)

  if (error) return { error: error.message }

  await logAction({
    action: 'user.role_changed',
    targetType: 'user',
    targetId: userId,
    details: { new_role: role },
  })

  return { success: true }
}

export async function assignUserPlan(userId: string, planSlug: string | null) {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  if (!planSlug) {
    // Remove user-level plan (fall back to company subscription)
    const { error } = await supabase
      .from('users')
      .update({ plan_id: null, subscription_status: null })
      .eq('id', userId)

    if (error) return { error: error.message }

    await logAction({
      action: 'user.plan_removed',
      targetType: 'user',
      targetId: userId,
      details: { plan: 'removed' },
    })

    return { success: true }
  }

  // Find the plan
  const { data: plan } = await supabase
    .from('plans')
    .select('id, slug, name')
    .eq('slug', planSlug)
    .single()

  if (!plan) return { error: `Plano '${planSlug}' não encontrado` }

  const { error } = await supabase
    .from('users')
    .update({ plan_id: plan.id, subscription_status: 'active' })
    .eq('id', userId)

  if (error) return { error: error.message }

  await logAction({
    action: 'user.plan_assigned',
    targetType: 'user',
    targetId: userId,
    details: { plan_slug: plan.slug, plan_name: plan.name },
  })

  return { success: true }
}

export async function getUserPlan(userId: string) {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  const { data } = await supabase
    .from('users')
    .select('plan_id, subscription_status, plans(slug, name)')
    .eq('id', userId)
    .single()

  return {
    planSlug: (data?.plans as any)?.slug || null,
    planName: (data?.plans as any)?.name || null,
    subscriptionStatus: data?.subscription_status || null,
  }
}

export async function deleteUser(userId: string) {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  const { data: user } = await supabase.from('users').select('email, full_name, company_id').eq('id', userId).single()

  const { error: authError } = await supabase.auth.admin.deleteUser(userId)
  if (authError) {
    const { error } = await supabase.from('users').delete().eq('id', userId)
    if (error) return { error: error.message }
  }

  await logAction({
    action: 'user.deleted',
    targetType: 'user',
    targetId: userId,
    details: { email: user?.email, full_name: user?.full_name },
  })

  return { success: true }
}
