-- LICITAGRAM BOT — Database tables for automated bidding

-- Bot portal configurations (credentials per company per portal)
CREATE TABLE IF NOT EXISTS public.bot_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  portal TEXT NOT NULL CHECK (portal IN ('comprasnet','bll','portal_compras','licitacoes_e')),
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  strategy TEXT DEFAULT 'minimal_decrease' CHECK (strategy IN ('minimal_decrease','timed')),
  min_decrease_value NUMERIC DEFAULT 0.01,
  min_decrease_percent NUMERIC DEFAULT 0.1,
  bid_times INTEGER[] DEFAULT '{60,30,10,3}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, portal)
);

-- Bot bidding sessions (one per pregão)
CREATE TABLE IF NOT EXISTS public.bot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  config_id UUID REFERENCES public.bot_configs(id),
  tender_id UUID REFERENCES public.tenders(id),
  pregao_id TEXT NOT NULL,
  portal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paused','completed','failed')),
  strategy_config JSONB DEFAULT '{}',
  min_price NUMERIC,
  max_bids INTEGER DEFAULT 10,
  progress JSONB DEFAULT '{}',
  result JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bot action log (audit trail)
CREATE TABLE IF NOT EXISTS public.bot_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.bot_sessions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('login','search','bid','message','error','completed')),
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bot_configs_company ON public.bot_configs(company_id);
CREATE INDEX IF NOT EXISTS idx_bot_sessions_pending ON public.bot_sessions(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_bot_sessions_company ON public.bot_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_bot_actions_session ON public.bot_actions(session_id);

-- RLS
ALTER TABLE public.bot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own bot configs"
  ON public.bot_configs FOR ALL
  USING (company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users manage own bot sessions"
  ON public.bot_sessions FOR ALL
  USING (company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users view own bot actions"
  ON public.bot_actions FOR SELECT
  USING (session_id IN (
    SELECT id FROM public.bot_sessions WHERE company_id IN (
      SELECT company_id FROM public.users WHERE id = auth.uid()
    )
  ));
