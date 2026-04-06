CREATE TABLE IF NOT EXISTS public.weekly_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  week_of DATE NOT NULL,

  type VARCHAR(30) NOT NULL CHECK (type IN (
    'window', 'new_rival', 'rival_surge', 'rival_weakness',
    'price_shift', 'trend', 'win_opportunity'
  )),
  priority VARCHAR(10) NOT NULL CHECK (priority IN ('urgent', 'high', 'normal')),

  headline TEXT NOT NULL,
  detail TEXT NOT NULL,
  metrics JSONB NOT NULL DEFAULT '[]',
  action_label VARCHAR(100),
  action_href VARCHAR(500),
  delta_text VARCHAR(100),
  icon_type VARCHAR(20),

  dismissed_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  acted_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,

  notified_telegram BOOLEAN DEFAULT false,
  notified_whatsapp BOOLEAN DEFAULT false,
  notified_email BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_weekly_actions_company_week
  ON public.weekly_actions(company_id, week_of);

CREATE INDEX IF NOT EXISTS idx_weekly_actions_active
  ON public.weekly_actions(company_id)
  WHERE dismissed_at IS NULL
    AND (snoozed_until IS NULL OR snoozed_until < now());

ALTER TABLE public.weekly_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own company weekly actions" ON public.weekly_actions
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Service role full access weekly actions" ON public.weekly_actions
  FOR ALL USING (auth.role() = 'service_role');
