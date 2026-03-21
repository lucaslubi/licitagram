// ─── Plan Types ──────────────────────────────────────────────────────────────

export interface PlanFeatures {
  portais: string[]
  chat_ia: boolean
  compliance_checker: boolean
  competitive_intel: boolean
  export_excel: boolean
  multi_cnpj: boolean
  api_integration: boolean
  proposal_generator: boolean
  bidding_bot: boolean
  priority_support: boolean
}

export interface Plan {
  id: string
  slug: string
  name: string
  description: string | null
  price_cents: number
  currency: string
  billing_interval: 'month' | 'year'
  stripe_price_id: string | null
  max_matches_per_month: number | null   // null = unlimited
  max_users: number | null               // null = unlimited
  max_ai_analyses_per_month: number | null
  max_alerts_per_day: number | null
  extra_user_price_cents: number
  features: PlanFeatures
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// ─── Subscription Types ──────────────────────────────────────────────────────

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'inactive'

export interface Subscription {
  id: string
  company_id: string
  plan_id: string | null
  plan: string | null              // legacy slug field (backward compat)
  status: SubscriptionStatus
  matches_used_this_month: number
  matches_reset_at: string
  extra_users_count: number
  ai_analyses_used: number
  max_alerts_per_day: number
  max_ai_analyses_month: number
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  current_period_start: string | null
  current_period_end: string | null
  created_at: string
  updated_at: string
}

export interface SubscriptionWithPlan extends Subscription {
  plans: Plan | null
}

// ─── Feature Key (type-safe feature checking) ────────────────────────────────

export type PlanFeatureKey = keyof PlanFeatures

// ─── Match Limit Check Result ────────────────────────────────────────────────

export interface MatchLimitResult {
  allowed: boolean
  used: number
  limit: number | null   // null = unlimited
  remaining: number | null
}

// ─── Plan Context (stored in cookie for middleware) ──────────────────────────

export interface PlanContext {
  planSlug: string | null
  planId: string | null
  features: PlanFeatures | null
  isPlatformAdmin: boolean
  subscriptionStatus: SubscriptionStatus | null
  /** Timestamp when context was created (for TTL check) */
  ts: number
}

/** Default features for users without a plan */
export const DEFAULT_FEATURES: PlanFeatures = {
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

/** Cookie name for plan context */
export const PLAN_CTX_COOKIE = 'x-plan-ctx'

/** Plan context TTL in milliseconds (5 minutes) */
export const PLAN_CTX_TTL_MS = 5 * 60 * 1000
