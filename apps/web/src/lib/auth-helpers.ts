import { createClient } from '@/lib/supabase/server'
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
      ufs_interesse, palavras_chave_filtro
    `)
    .eq('id', user.id)
    .single()

  if (!profile) return null

  // Fetch subscription + plan if user has a company
  let subscription: SubscriptionWithPlan | null = null
  if (profile.company_id) {
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
  }

  const plan = subscription?.plans || null

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
