import { createClient } from '@/lib/supabase/server'
import { cached, CacheKeys, TTL, invalidateCache } from './redis'
import type {
  Plan,
  PlanFeatureKey,
  SubscriptionWithPlan,
  MatchLimitResult,
  PlanFeatures,
  DEFAULT_FEATURES,
} from '@licitagram/shared'

/**
 * Plan & subscription data layer.
 *
 * All functions use Redis caching via the shared `cached()` helper.
 * Cache is busted by:
 * - Admin plan CRUD actions (invalidateAllPlans)
 * - Stripe webhook (invalidateCompanySubscription)
 * - Workers after match creation (invalidateCompanySubscription)
 */

// ─── Plan Queries ───────────────────────────────────────────────────────────

/**
 * Fetch all active plans ordered by sort_order.
 * Global data — same for all users. Cached 10 min.
 */
export async function getActivePlans(): Promise<Plan[]> {
  return cached(
    CacheKeys.activePlans,
    async () => {
      const supabase = await createClient()
      const { data } = await supabase
        .from('plans')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      return (data || []) as Plan[]
    },
    TTL.activePlans,
  )
}

/**
 * Fetch a single plan by slug. Cached 10 min.
 */
export async function getPlanBySlug(slug: string): Promise<Plan | null> {
  return cached(
    CacheKeys.planDetail(slug),
    async () => {
      const supabase = await createClient()
      const { data } = await supabase
        .from('plans')
        .select('*')
        .eq('slug', slug)
        .single()

      return data as Plan | null
    },
    TTL.planDetail,
  )
}

/**
 * Fetch a single plan by ID. Cached 10 min.
 */
export async function getPlanById(planId: string): Promise<Plan | null> {
  return cached(
    CacheKeys.planDetail(planId),
    async () => {
      const supabase = await createClient()
      const { data } = await supabase
        .from('plans')
        .select('*')
        .eq('id', planId)
        .single()

      return data as Plan | null
    },
    TTL.planDetail,
  )
}

// ─── Subscription Queries ───────────────────────────────────────────────────

/**
 * Fetch company subscription with plan JOIN. Cached 2 min.
 * Returns null if no subscription exists.
 */
export async function getCompanySubscription(
  companyId: string,
): Promise<SubscriptionWithPlan | null> {
  return cached(
    CacheKeys.companySubscription(companyId),
    async () => {
      const supabase = await createClient()
      const { data } = await supabase
        .from('subscriptions')
        .select(`*, plans(*)`)
        .eq('company_id', companyId)
        .single()

      return data as SubscriptionWithPlan | null
    },
    TTL.companySubscription,
  )
}

// ─── Feature Checking ───────────────────────────────────────────────────────

/**
 * Check if a company has access to a specific feature.
 * Returns false if no active subscription or feature not included.
 */
export async function checkFeature(
  companyId: string,
  feature: PlanFeatureKey,
): Promise<boolean> {
  const sub = await getCompanySubscription(companyId)
  if (!sub || !sub.plans) return false
  if (!['active', 'trialing'].includes(sub.status)) return false

  const features = sub.plans.features as PlanFeatures
  if (!features) return false

  const value = features[feature]
  // For arrays (like portais), check non-empty
  if (Array.isArray(value)) return value.length > 0
  return !!value
}

/**
 * Get all features for a company (resolved from subscription → plan).
 * Returns DEFAULT_FEATURES if no active plan.
 */
export async function getCompanyFeatures(companyId: string): Promise<PlanFeatures> {
  const sub = await getCompanySubscription(companyId)
  if (!sub || !sub.plans) {
    return {
      portais: [],
      chat_ia: false,
      compliance_checker: false,
      competitive_intel: false,
      export_excel: false,
      multi_cnpj: false,
      api_integration: false,
      proposal_generator: false,
      bidding_bot: false,
      priority_support: false,
    }
  }
  if (!['active', 'trialing'].includes(sub.status)) {
    return {
      portais: [],
      chat_ia: false,
      compliance_checker: false,
      competitive_intel: false,
      export_excel: false,
      multi_cnpj: false,
      api_integration: false,
      proposal_generator: false,
      bidding_bot: false,
      priority_support: false,
    }
  }

  return sub.plans.features as PlanFeatures
}

// ─── Match Limit Checking ───────────────────────────────────────────────────

/**
 * Check match limit for a company without incrementing.
 * Used by UI to show usage indicators.
 */
export async function checkMatchLimit(companyId: string): Promise<MatchLimitResult> {
  const sub = await getCompanySubscription(companyId)
  if (!sub || !sub.plans) {
    return { allowed: false, used: 0, limit: 0, remaining: 0 }
  }
  if (!['active', 'trialing'].includes(sub.status)) {
    return { allowed: false, used: sub.matches_used_this_month || 0, limit: 0, remaining: 0 }
  }

  const used = sub.matches_used_this_month || 0
  const limit = sub.plans.max_matches_per_month

  // NULL = unlimited
  if (limit === null) {
    return { allowed: true, used, limit: null, remaining: null }
  }

  return {
    allowed: used < limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  }
}

// ─── Cache Invalidation ─────────────────────────────────────────────────────

/** Invalidate all plan caches (after admin CRUD) */
export async function invalidateAllPlans(): Promise<void> {
  await invalidateCache(CacheKeys.allPlans)
}

/** Invalidate subscription cache for a company (after Stripe webhook, match creation) */
export async function invalidateCompanySubscription(companyId: string): Promise<void> {
  await invalidateCache(CacheKeys.allCompanySubscription(companyId))
}
