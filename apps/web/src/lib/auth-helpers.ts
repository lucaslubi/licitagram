import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import type {
  Plan,
  PlanFeatures,
  SubscriptionWithPlan,
  PlanContext,
  AdminPermissions,
} from '@licitagram/shared'

/**
 * Auth helpers with plan context.
 *
 * These functions combine auth checks with plan/subscription lookups
 * to provide a complete user context for Server Components and Actions.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UserWithPlan {
  userId: string
  email: string
  fullName: string | null
  companyId: string | null
  role: 'admin' | 'user' | 'viewer'
  minScore: number
  isPlatformAdmin: boolean
  adminPermissions: AdminPermissions | null
  isActive: boolean
  subscription: SubscriptionWithPlan | null
  plan: Plan | null
  features: PlanFeatures | null
  onboardingCompleted: boolean
  telegramChatId: number | null
  ufsInteresse: string[]
  palavrasChaveFiltro: string[]
}

// ─── Core Auth Functions ─────────────────────────────────────────────────────

/**
 * Get authenticated user with full plan context in a single operation.
 * This is the primary function for Server Components that need plan data.
 *
 * Queries:
 * 1. Auth user (always fresh, not cached)
 * 2. User profile + subscription + plan (single query with JOINs)
 *
 * Returns null if not authenticated.
 */
export async function getUserWithPlan(): Promise<UserWithPlan | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Single query: user profile + subscription + plan
  const { data: profile } = await supabase
    .from('users')
    .select(`
      id, company_id, full_name, role, min_score,
      is_platform_admin, admin_permissions, is_active,
      onboarding_completed, telegram_chat_id,
      ufs_interesse, palavras_chave_filtro,
      plan_id, subscription_status
    `)
    .eq('id', user.id)
    .single()

  if (!profile) return null

  // ── 1. Check user-level plan override first ──────────────────────────────
  let subscription: SubscriptionWithPlan | null = null
  let plan: Plan | null = null

  if (profile.plan_id) {
    // User has a direct plan assignment — takes priority over company subscription
    const { data: userPlan } = await supabase
      .from('plans')
      .select('*')
      .eq('id', profile.plan_id)
      .single()

    if (userPlan) {
      plan = userPlan as Plan
      // Build a synthetic subscription object for compatibility
      subscription = {
        id: `user-${user.id}`,
        company_id: profile.company_id,
        plan_id: profile.plan_id,
        plan: userPlan.slug,
        status: profile.subscription_status || 'active',
        plans: userPlan,
        matches_used_this_month: 0,
        matches_reset_at: new Date().toISOString(),
        ai_analyses_used: 0,
        extra_users_count: 0,
        max_companies: 999,
        max_alerts_per_day: userPlan.max_alerts_per_day ?? 999,
        max_ai_analyses_month: userPlan.max_ai_analyses_per_month ?? 999,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        current_period_start: null,
        current_period_end: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as SubscriptionWithPlan
    }
  }

  // ── 2. Fallback: company-level subscription ──────────────────────────────
  if (!subscription && profile.company_id) {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select(`*, plans(*)`)
      .eq('company_id', profile.company_id)
      .in('status', ['active', 'trialing'])
      .single()
    subscription = sub as SubscriptionWithPlan | null

    // Fallback: check sibling companies in the user's group
    if (!subscription) {
      const { data: siblings } = await supabase
        .from('user_companies')
        .select('company_id')
        .eq('user_id', user.id)

      if (siblings && siblings.length > 0) {
        const siblingIds = siblings
          .map((s: any) => s.company_id)
          .filter((id: string) => id !== profile.company_id)

        if (siblingIds.length > 0) {
          const { data: bestSub } = await supabase
            .from('subscriptions')
            .select(`*, plans(*)`)
            .in('company_id', siblingIds)
            .in('status', ['active', 'trialing'])
            .order('plan_id', { ascending: false })
            .limit(1)
            .single()

          if (bestSub) subscription = bestSub as SubscriptionWithPlan
        }
      }
    }

    if (!plan) plan = subscription?.plans || null
  }

  return {
    userId: user.id,
    email: user.email || '',
    fullName: profile.full_name,
    companyId: profile.company_id,
    role: profile.role || 'user',
    minScore: profile.min_score ?? 10,
    isPlatformAdmin: profile.is_platform_admin || false,
    adminPermissions: profile.admin_permissions as AdminPermissions | null,
    isActive: profile.is_active !== false, // default true for backward compat
    subscription,
    plan,
    features: plan?.features as PlanFeatures | null,
    onboardingCompleted: profile.onboarding_completed || false,
    telegramChatId: profile.telegram_chat_id ?? null,
    ufsInteresse: profile.ufs_interesse || [],
    palavrasChaveFiltro: profile.palavras_chave_filtro || [],
  }
}

// ─── Guard Functions ─────────────────────────────────────────────────────────

/**
 * Require authenticated user. Redirects to /login if not authenticated.
 */
export async function requireAuth(): Promise<UserWithPlan> {
  const user = await getUserWithPlan()
  if (!user) redirect('/login')
  return user
}

/**
 * Require platform admin. Redirects to /dashboard if not admin.
 * Use this in admin Server Components and Actions.
 */
export async function requirePlatformAdmin(): Promise<UserWithPlan> {
  const user = await getUserWithPlan()
  if (!user) redirect('/login')
  if (!user.isPlatformAdmin) redirect('/map')
  return user
}

/**
 * Check if a user has a specific admin permission.
 * Platform admins with no explicit permissions object have ALL permissions.
 */
export function checkAdminPermission(
  user: UserWithPlan,
  section: string,
): boolean {
  if (!user.isPlatformAdmin) return false
  // No permissions object = full access (super admin)
  if (!user.adminPermissions) return true
  return user.adminPermissions[section] === true
}

/**
 * Require a specific admin permission. Redirects if not authorized.
 */
export async function requireAdminPermission(section: string): Promise<UserWithPlan> {
  const user = await requirePlatformAdmin()
  if (!checkAdminPermission(user, section)) redirect('/admin')
  return user
}

// ─── Feature Guards ──────────────────────────────────────────────────────────

/**
 * Check if user has access to a plan feature.
 * Platform admins always have access.
 */
export function hasFeature(user: UserWithPlan, feature: keyof PlanFeatures): boolean {
  if (user.isPlatformAdmin) return true
  if (!user.features) return false
  if (!user.subscription || !['active', 'trialing'].includes(user.subscription.status)) return false

  const value = user.features[feature]
  if (Array.isArray(value)) return value.length > 0
  return !!value
}

/**
 * Check if user has an active subscription.
 * Platform admins are always considered active.
 */
export function hasActiveSubscription(user: UserWithPlan): boolean {
  if (user.isPlatformAdmin) return true
  if (!user.subscription) return false
  return ['active', 'trialing'].includes(user.subscription.status)
}

// ─── Plan Context Cookie ─────────────────────────────────────────────────────

/**
 * Build a PlanContext object from a UserWithPlan.
 * Used by middleware to store plan data in a cookie for fast access.
 */
export function buildPlanContext(user: UserWithPlan): PlanContext {
  return {
    planSlug: user.plan?.slug || null,
    planId: user.plan?.id || null,
    features: user.features || null,
    isPlatformAdmin: user.isPlatformAdmin,
    subscriptionStatus: user.subscription?.status || null,
    ts: Date.now(),
  }
}

// ─── Trial Subscription Provisioning ────────────────────────────────────────

/**
 * Ensure a trial subscription exists for a user who has a company but no subscription.
 * This is called from the dashboard layout on every page load as a safety net.
 * Uses service-role client to bypass RLS for the subscription insert.
 *
 * Returns true if a trial was created, false otherwise.
 */
export async function ensureTrialSubscription(user: UserWithPlan): Promise<boolean> {
  // Skip if: no company, already has subscription, or is admin
  if (!user.companyId || user.subscription || user.isPlatformAdmin) return false

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Double-check: maybe subscription exists with a non-active status
  // (e.g., 'canceled' or 'inactive' — don't create a new trial over it)
  const { data: anySub } = await serviceSupabase
    .from('subscriptions')
    .select('id, status')
    .eq('company_id', user.companyId)
    .limit(1)
    .maybeSingle()

  if (anySub) return false // Subscription exists (possibly expired) — don't overwrite

  const now = new Date()
  const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const { error } = await serviceSupabase.from('subscriptions').insert({
    company_id: user.companyId,
    plan: 'trial',
    plan_id: null,
    status: 'trialing',
    started_at: now.toISOString(),
    expires_at: trialEnd.toISOString(),
    current_period_start: now.toISOString(),
    current_period_end: trialEnd.toISOString(),
    matches_used_this_month: 0,
    matches_reset_at: now.toISOString(),
  })

  if (error) {
    // 23505 = unique constraint violation — subscription already exists (race condition)
    if (error.code !== '23505') {
      console.error('[ensureTrialSubscription] Insert error:', error.message)
    }
    return false
  }

  console.log('[ensureTrialSubscription] Created trial for company:', user.companyId)
  return true
}
