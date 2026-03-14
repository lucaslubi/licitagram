-- Add stripe_customer_id to users table (used by checkout route)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Add period tracking columns to subscriptions
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

-- Update status check constraint to include 'past_due'
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'inactive', 'trialing', 'canceled', 'past_due'));

-- Add unique constraint on company_id for upsert support
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_company_id_key;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_company_id_key UNIQUE (company_id);

-- Index for stripe lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id ON public.subscriptions (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_company ON public.subscriptions (company_id);
