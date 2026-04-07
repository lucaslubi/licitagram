-- Channel onboarding tracking
-- Records when each notification channel was first activated for a user, so the
-- system disparou the trial WOW burst (or backfill) exactly once per channel.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS whatsapp_onboarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS telegram_onboarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_onboarded_at    timestamptz;

COMMENT ON COLUMN public.users.whatsapp_onboarded_at IS 'When the WhatsApp onboarding burst (trial WOW or backfill) was sent. NULL = never sent.';
COMMENT ON COLUMN public.users.telegram_onboarded_at IS 'When the Telegram onboarding burst (trial WOW or backfill) was sent. NULL = never sent.';
COMMENT ON COLUMN public.users.email_onboarded_at    IS 'When the email onboarding burst (trial WOW or backfill) was sent. NULL = never sent.';
