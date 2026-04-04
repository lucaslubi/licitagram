-- ============================================================
-- User-Level Plans: Allow plans tied to individual users
-- instead of (or in addition to) company-level subscriptions.
--
-- When users.plan_id IS NOT NULL, it overrides the company
-- subscription. This enables scenarios like:
-- - Assigning Enterprise to a specific user
-- - User registers a CNPJ already owned by another account
--   and still has their own plan tier
-- ============================================================

-- Add user-level plan override
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.plans(id);

-- Add user-level subscription status (defaults to 'active' when plan_id is set)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT NULL
  CHECK (subscription_status IS NULL OR subscription_status IN ('active', 'trialing', 'canceled', 'past_due'));

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_users_plan_id ON public.users(plan_id) WHERE plan_id IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN public.users.plan_id IS 'User-level plan override. When set, takes precedence over company subscription.';
COMMENT ON COLUMN public.users.subscription_status IS 'Status of the user-level plan. Only used when plan_id is set.';
