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
    supabase.from('subscriptions').select('*, plans(*)').eq('company_id', companyId).maybeSingle(),
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

// ============================================================
// Admin Alerts (anomaly detection)
// ============================================================

export interface AdminAlert {
  id: string
  type: string
  severity: 'info' | 'warning' | 'critical'
  company_id: string | null
  message: string
  metadata: Record<string, unknown>
  resolved: boolean
  created_at: string
  companies?: { razao_social: string | null; cnpj: string | null } | null
}

export async function listAdminAlerts(params?: {
  severity?: 'info' | 'warning' | 'critical'
  onlyUnresolved?: boolean
  limit?: number
}) {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  let query = supabase
    .from('admin_alerts')
    .select('*, companies(razao_social, cnpj)')
    .order('created_at', { ascending: false })
    .limit(params?.limit ?? 100)

  if (params?.onlyUnresolved !== false) query = query.eq('resolved', false)
  if (params?.severity) query = query.eq('severity', params.severity)

  const { data, error } = await query
  return {
    alerts: (data as AdminAlert[] | null) || [],
    error: error?.message || null,
  }
}

export async function countUnresolvedAlerts(): Promise<number> {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()
  const { count } = await supabase
    .from('admin_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('resolved', false)
  return count || 0
}

export async function resolveAlert(alertId: string) {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()
  const { error } = await supabase
    .from('admin_alerts')
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq('id', alertId)
  if (error) return { error: error.message }
  await logAction({
    action: 'admin_alert.resolved',
    targetType: 'admin_alert',
    targetId: alertId,
    details: {},
  })
  return { success: true }
}

export async function runAnomalyDetection() {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()
  const { data, error } = await supabase.rpc('detect_client_anomalies')
  if (error) return { error: error.message }
  return { success: true, unresolvedCount: data as number }
}

// Enriched detail including contact channels + activity
export async function getClientDetailEnriched(companyId: string) {
  await requirePlatformAdmin()
  const supabase = getServiceSupabase()

  const [overviewResult, alertsResult, notifResult, recentMatchesResult] = await Promise.all([
    supabase.from('admin_client_overview').select('*').eq('company_id', companyId).maybeSingle(),
    supabase.from('admin_alerts').select('*').eq('company_id', companyId).eq('resolved', false).order('created_at', { ascending: false }),
    supabase
      .from('notifications')
      .select('id, type, title, created_at, read')
      .in('user_id', (
        await supabase.from('users').select('id').eq('company_id', companyId)
      ).data?.map(u => u.id) || [])
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('matches')
      .select('id, score, status, created_at, tender_id')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  return {
    overview: overviewResult.data,
    activeAlerts: alertsResult.data || [],
    recentNotifications: notifResult.data || [],
    recentMatches: recentMatchesResult.data || [],
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
    .maybeSingle()

  // If changing plan, also sync the legacy `plan` slug column
  const fullUpdates: Record<string, unknown> = { ...updates }
  let planSlug: string | null = null
  if (updates.plan_id) {
    const { data: plan } = await supabase
      .from('plans')
      .select('slug, features, max_matches_per_month')
      .eq('id', updates.plan_id)
      .single()
    if (plan) {
      fullUpdates.plan = plan.slug
      planSlug = plan.slug
    }

    // When admin changes plan, auto-activate the subscription
    // so the user immediately gets access to all features.
    // Admin can still manually set status afterward if needed.
    if (!updates.status) {
      const currentStatus = before?.status
      if (!currentStatus || !['active', 'trialing'].includes(currentStatus)) {
        fullUpdates.status = 'active'
      }
    }
  }

  let error: { message: string } | null = null
  const now = new Date().toISOString()

  if (before) {
    // UPDATE existing subscription
    const result = await supabase
      .from('subscriptions')
      .update(fullUpdates)
      .eq('company_id', companyId)
    error = result.error
  } else {
    // INSERT new subscription (company had none — e.g. pre-trial clients)
    const periodEnd = new Date()
    periodEnd.setMonth(periodEnd.getMonth() + 1)

    const result = await supabase
      .from('subscriptions')
      .insert({
        company_id: companyId,
        plan: planSlug || 'trial',
        plan_id: updates.plan_id || null,
        status: updates.status || 'active',
        started_at: now,
        current_period_start: now,
        current_period_end: periodEnd.toISOString(),
        matches_used_this_month: 0,
        matches_reset_at: now,
      })
    error = result.error
  }

  if (error) return { error: error.message }

  await invalidateCompanySubscription(companyId)

  await logAction({
    action: before ? 'subscription.updated' : 'subscription.created',
    targetType: 'company',
    targetId: companyId,
    details: {
      before_status: before?.status || null,
      before_plan: before?.plan_id || null,
      updates: fullUpdates,
      was_new: !before,
    },
  })

  return { success: true }
}
