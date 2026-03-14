-- ============================================================
-- PLANS SYSTEM: Dynamic plans table with CRUD support
-- Plans are managed via admin panel, no deploy needed to change
-- ============================================================

CREATE TABLE public.plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,           -- 19700 = R$ 197,00
  currency TEXT DEFAULT 'BRL' NOT NULL,
  billing_interval TEXT DEFAULT 'month' CHECK (billing_interval IN ('month', 'year')),
  stripe_price_id TEXT,

  -- Usage limits (NULL = unlimited)
  max_matches_per_month INTEGER,
  max_users INTEGER DEFAULT 1,
  max_ai_analyses_per_month INTEGER DEFAULT 50,
  max_alerts_per_day INTEGER DEFAULT 10,
  extra_user_price_cents INTEGER DEFAULT 0,

  -- Feature flags (JSONB for extensibility without migrations)
  features JSONB DEFAULT '{}'::jsonb NOT NULL,

  is_active BOOLEAN DEFAULT true NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Auto-update timestamp
CREATE TRIGGER set_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX idx_plans_slug ON public.plans(slug);
CREATE INDEX idx_plans_active ON public.plans(is_active) WHERE is_active = true;
CREATE INDEX idx_plans_sort ON public.plans(sort_order);

-- RLS: anyone authenticated can read plans, writes are service_role only
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_select_authenticated" ON public.plans
  FOR SELECT USING (auth.role() = 'authenticated');

-- No INSERT/UPDATE/DELETE policies for anon/authenticated
-- Admin actions go through service_role client which bypasses RLS

-- ============================================================
-- SEED: Initial plans matching product spec
-- ============================================================
INSERT INTO public.plans (slug, name, description, price_cents, max_matches_per_month, max_users, max_ai_analyses_per_month, max_alerts_per_day, extra_user_price_cents, features, sort_order) VALUES
(
  'starter',
  'Starter',
  'Ideal para pequenas empresas que querem começar a monitorar licitações.',
  19700,   -- R$ 197/mês
  50,      -- 50 matches/mês
  1,       -- 1 usuário
  50,      -- 50 análises IA/mês
  10,      -- 10 alertas/dia
  4900,    -- R$ 49/mês por usuário extra
  '{"portais": ["pncp", "comprasgov"], "chat_ia": false, "compliance_checker": false, "competitive_intel": false, "export_excel": false, "multi_cnpj": false, "api_integration": false, "proposal_generator": false, "priority_support": false}'::jsonb,
  1
),
(
  'professional',
  'Professional',
  'Para empresas que participam ativamente de licitações e precisam de inteligência competitiva.',
  49700,   -- R$ 497/mês
  NULL,    -- matches ilimitados
  5,       -- até 5 usuários
  NULL,    -- análises IA ilimitadas
  NULL,    -- alertas ilimitados
  4900,    -- R$ 49/mês por usuário extra
  '{"portais": ["pncp", "comprasgov", "bec_sp", "compras_mg", "legado", "arp"], "chat_ia": true, "compliance_checker": true, "competitive_intel": true, "export_excel": true, "multi_cnpj": false, "api_integration": false, "proposal_generator": false, "priority_support": false}'::jsonb,
  2
),
(
  'enterprise',
  'Enterprise',
  'Solução completa para grandes empresas com múltiplos CNPJs e necessidades avançadas.',
  99700,   -- R$ 997/mês
  NULL,    -- matches ilimitados
  NULL,    -- usuários ilimitados
  NULL,    -- análises IA ilimitadas
  NULL,    -- alertas ilimitados
  0,       -- sem custo extra (ilimitado)
  '{"portais": ["pncp", "comprasgov", "bec_sp", "compras_mg", "legado", "arp"], "chat_ia": true, "compliance_checker": true, "competitive_intel": true, "export_excel": true, "multi_cnpj": true, "api_integration": true, "proposal_generator": true, "priority_support": true}'::jsonb,
  3
);
