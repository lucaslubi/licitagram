-- ============================================================
-- SUBSCRIPTION: Link to plans table + usage tracking
-- ============================================================

-- Add plan_id FK to reference dynamic plans table
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.plans(id);

-- Migrate existing subscriptions to use plan_id
UPDATE public.subscriptions s
SET plan_id = p.id
FROM public.plans p
WHERE s.plan = p.slug AND s.plan_id IS NULL;

-- For trial subscriptions (no matching plan row), leave plan_id NULL
-- Trial is a status, not a plan — handled by subscription.status = 'trialing'

-- Monthly usage counters
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS matches_used_this_month INTEGER DEFAULT 0;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS matches_reset_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS extra_users_count INTEGER DEFAULT 0;

-- Relax the plan CHECK to allow NULL (plan_id is the source of truth now)
-- Keep the column for backward compatibility during transition
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE public.subscriptions ALTER COLUMN plan DROP NOT NULL;

-- Index for plan_id lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON public.subscriptions(plan_id);
