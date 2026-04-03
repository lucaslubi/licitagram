-- ============================================================
-- Feature 1: Email Notifications
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT false;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS email_notified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.email_notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
  template TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
  resend_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.email_notification_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own email logs" ON public.email_notification_logs
  FOR SELECT USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_email_logs_user ON public.email_notification_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_notification_logs(status) WHERE status = 'pending';
