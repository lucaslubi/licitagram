'use server'

import { createClient } from '@supabase/supabase-js'
import { requirePlatformAdmin } from '@/lib/auth-helpers'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Log an administrative action to the audit_logs table.
 * Called by all admin actions for compliance tracking.
 */
export async function logAction(params: {
  action: string
  targetType?: string
  targetId?: string
  details?: Record<string, unknown>
}) {
  const user = await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  await supabase.from('audit_logs').insert({
    actor_id: user.userId,
    actor_email: user.email,
    action: params.action,
    target_type: params.targetType || null,
    target_id: params.targetId || null,
    details: params.details || {},
  })
}

/**
 * Fetch audit logs with filtering and pagination.
 */
export async function getAuditLogs(params: {
  page?: number
  pageSize?: number
  action?: string
  targetType?: string
  actorId?: string
}) {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  const page = params.page || 1
  const pageSize = params.pageSize || 50

  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (params.action) query = query.eq('action', params.action)
  if (params.targetType) query = query.eq('target_type', params.targetType)
  if (params.actorId) query = query.eq('actor_id', params.actorId)

  const { data, count, error } = await query

  return {
    logs: data || [],
    count: count || 0,
    totalPages: Math.ceil((count || 0) / pageSize),
    error: error?.message || null,
  }
}
