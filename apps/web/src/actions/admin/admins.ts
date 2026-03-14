'use server'

import { createClient } from '@supabase/supabase-js'
import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { logAction } from './audit'
import { invalidateCompanySubscription } from '@/lib/plans'
import type { AdminPermissions } from '@licitagram/shared'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Upgrade the user's company subscription to Enterprise plan */
async function ensureEnterprisePlan(userId: string) {
  const supabase = getServiceSupabase()

  // Get user's company
  const { data: user } = await supabase.from('users').select('company_id').eq('id', userId).single()
  if (!user?.company_id) return

  // Get enterprise plan
  const { data: enterprise } = await supabase.from('plans').select('id').eq('slug', 'enterprise').single()
  if (!enterprise) return

  // Upsert subscription to enterprise + active
  const { data: existing } = await supabase.from('subscriptions').select('id').eq('company_id', user.company_id).single()

  if (existing) {
    await supabase
      .from('subscriptions')
      .update({ plan_id: enterprise.id, plan: 'enterprise', status: 'active' })
      .eq('company_id', user.company_id)
  } else {
    await supabase
      .from('subscriptions')
      .insert({ company_id: user.company_id, plan_id: enterprise.id, plan: 'enterprise', status: 'active' })
  }

  await invalidateCompanySubscription(user.company_id)
}

export async function listAdmins() {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, is_platform_admin, admin_permissions, created_at')
    .eq('is_platform_admin', true)
    .order('created_at', { ascending: true })

  return { admins: data || [], error: error?.message || null }
}

export async function grantAdmin(userId: string, permissions?: AdminPermissions) {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  const { error } = await supabase
    .from('users')
    .update({
      is_platform_admin: true,
      admin_permissions: permissions || null,
    })
    .eq('id', userId)

  if (error) return { error: error.message }

  // Super admin (no permissions = full access) gets Enterprise plan
  if (!permissions) {
    await ensureEnterprisePlan(userId)
  }

  await logAction({
    action: 'admin.granted',
    targetType: 'user',
    targetId: userId,
    details: { permissions, upgraded_to_enterprise: !permissions },
  })

  return { success: true }
}

export async function updateAdminPermissions(userId: string, permissions: AdminPermissions) {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  const { error } = await supabase
    .from('users')
    .update({ admin_permissions: permissions })
    .eq('id', userId)

  if (error) return { error: error.message }

  await logAction({
    action: 'admin.permissions_updated',
    targetType: 'user',
    targetId: userId,
    details: { permissions },
  })

  return { success: true }
}

export async function revokeAdmin(userId: string) {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  const { error } = await supabase
    .from('users')
    .update({ is_platform_admin: false, admin_permissions: null })
    .eq('id', userId)

  if (error) return { error: error.message }

  await logAction({
    action: 'admin.revoked',
    targetType: 'user',
    targetId: userId,
  })

  return { success: true }
}
