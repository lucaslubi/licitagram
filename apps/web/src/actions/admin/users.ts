'use server'

import { createClient } from '@supabase/supabase-js'
import { requirePlatformAdmin } from '@/lib/auth-helpers'
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
    .select('id, full_name, email, role, is_active, is_platform_admin, company_id, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (params?.search) {
    query = query.or(`full_name.ilike.%${params.search}%,email.ilike.%${params.search}%`)
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
