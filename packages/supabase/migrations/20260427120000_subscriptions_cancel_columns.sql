-- Wave 3 — /conta/assinatura: cancel-at-period-end tracking
-- Adds columns needed for cancel-at-period-end UX (we keep access until end of cycle).

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_subscriptions_cancel_pending
  ON public.subscriptions(cancel_at_period_end)
  WHERE cancel_at_period_end = true;
