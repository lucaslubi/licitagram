-- ============================================================
-- Notification Filters: Value Range + Multi-Company Control
-- ============================================================

-- 1. Value range filters on companies (for notifications)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS min_valor NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_valor NUMERIC(15,2) DEFAULT NULL;

COMMENT ON COLUMN public.companies.min_valor IS 'Minimum tender value for notifications (NULL = no minimum)';
COMMENT ON COLUMN public.companies.max_valor IS 'Maximum tender value for notifications (NULL = no maximum)';

-- 2. Per-company notification toggle on user_companies
ALTER TABLE public.user_companies
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.user_companies.notifications_enabled IS 'Whether this user receives notifications for this company';

-- Backfill: all existing links get notifications enabled (preserves current behavior)
UPDATE public.user_companies SET notifications_enabled = true WHERE notifications_enabled IS NULL;
