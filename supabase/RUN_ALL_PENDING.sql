-- ============================================================================
-- LICITAGRAM — SQL COMPLETO PARA RODAR NO SUPABASE
-- Data: 2026-04-05
-- Instrucoes: Cole tudo no SQL Editor do Supabase e clique Run.
-- Ordem: Migrations de 20260402 a 20260405 (todas pendentes)
-- ============================================================================


-- ████████████████████████████████████████████████████████████████████████████
-- MIGRATION 1: Notification Filters (20260402000000)
-- Adiciona filtros de valor e toggle de notificacao por empresa
-- ████████████████████████████████████████████████████████████████████████████

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS min_valor NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_valor NUMERIC(15,2) DEFAULT NULL;

COMMENT ON COLUMN public.companies.min_valor IS 'Minimum tender value for notifications (NULL = no minimum)';
COMMENT ON COLUMN public.companies.max_valor IS 'Maximum tender value for notifications (NULL = no maximum)';

ALTER TABLE public.user_companies
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.user_companies.notifications_enabled IS 'Whether this user receives notifications for this company';

UPDATE public.user_companies SET notifications_enabled = true WHERE notifications_enabled IS NULL;


-- ████████████████████████████████████████████████████████████████████████████
-- MIGRATION 2: Email Notifications (20260403000000)
-- Tabela de logs de email e colunas de controle
-- ████████████████████████████████████████████████████████████████████████████

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


-- ████████████████████████████████████████████████████████████████████████████
-- MIGRATION 3: Impugnation Templates (20260403100000)
-- Tabela de impugnacoes de edital
-- ████████████████████████████████████████████████████████████████████████████

CREATE TABLE IF NOT EXISTS public.impugnations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  tender_id UUID REFERENCES public.tenders(id) ON DELETE CASCADE NOT NULL,
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
  motivo TEXT NOT NULL,
  fundamentacao TEXT NOT NULL,
  texto_completo TEXT NOT NULL,
  prazo_limite TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected')),
  storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.impugnations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own impugnations" ON public.impugnations
  FOR ALL USING (company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_impugnations_company ON public.impugnations(company_id);
CREATE INDEX IF NOT EXISTS idx_impugnations_tender ON public.impugnations(tender_id);


-- ████████████████████████████████████████████████████████████████████████████
-- MIGRATION 4: Lance Analytics / Simulador (20260403200000)
-- Materialized view basica de padroes de lance (sera substituida abaixo)
-- ████████████████████████████████████████████████████████████████████████████

-- NOTA: Esta materialized view sera recriada (DROP + CREATE) na Migration 7
-- abaixo com colunas extras. Criamos aqui apenas para manter a sequencia
-- de migrations intacta, mas o DROP da Migration 7 vai sobrescreve-la.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.competitor_bid_patterns AS
SELECT
  c.cnpj,
  c.nome,
  COUNT(*) as total_participacoes,
  COUNT(*) FILTER (WHERE c.situacao = 'Vencedor') as total_vitorias,
  ROUND(AVG(
    CASE WHEN t.valor_estimado > 0 AND c.valor_proposta > 0
    THEN ((t.valor_estimado - c.valor_proposta) / t.valor_estimado * 100)::numeric
    END
  ), 2) as desconto_medio_pct,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
    CASE WHEN t.valor_estimado > 0 AND c.valor_proposta > 0
    THEN ((t.valor_estimado - c.valor_proposta) / t.valor_estimado * 100)::numeric
    END
  ), 2) as desconto_mediano_pct,
  MIN(CASE WHEN t.valor_estimado > 0 AND c.valor_proposta > 0
    THEN ((t.valor_estimado - c.valor_proposta) / t.valor_estimado * 100)::numeric
    END) as desconto_min_pct,
  MAX(CASE WHEN t.valor_estimado > 0 AND c.valor_proposta > 0
    THEN ((t.valor_estimado - c.valor_proposta) / t.valor_estimado * 100)::numeric
    END) as desconto_max_pct
FROM public.competitors c
JOIN public.tenders t ON t.id = c.tender_id
WHERE c.cnpj IS NOT NULL
  AND c.valor_proposta > 0
GROUP BY c.cnpj, c.nome
HAVING COUNT(*) >= 2;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bid_patterns_cnpj ON public.competitor_bid_patterns(cnpj);

CREATE OR REPLACE FUNCTION refresh_bid_patterns() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.competitor_bid_patterns;
END;
$$ LANGUAGE plpgsql;


-- ████████████████████████████████████████████████████████████████████████████
-- MIGRATION 5: Notification Center (20260403300000)
-- Centro de notificacoes unificado
-- ████████████████████████████████████████████████████████████████████████████

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'new_match', 'hot_match', 'urgency',
    'certidao_expiring', 'certidao_expired',
    'proposal_generated', 'outcome_prompt',
    'bot_session_completed', 'impugnation_deadline',
    'weekly_report', 'system'
  )),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  metadata JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own notifications" ON public.notifications
  FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_company ON public.notifications(company_id, created_at DESC);


-- ████████████████████████████████████████████████████████████████████████████
-- MIGRATION 6: User-Level Plans (20260404000000)
-- Planos por usuario (override do plano da empresa)
-- ████████████████████████████████████████████████████████████████████████████

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.plans(id);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT NULL
  CHECK (subscription_status IS NULL OR subscription_status IN ('active', 'trialing', 'canceled', 'past_due'));

CREATE INDEX IF NOT EXISTS idx_users_plan_id ON public.users(plan_id) WHERE plan_id IS NOT NULL;

COMMENT ON COLUMN public.users.plan_id IS 'User-level plan override. When set, takes precedence over company subscription.';
COMMENT ON COLUMN public.users.subscription_status IS 'Status of the user-level plan. Only used when plan_id is set.';


-- ████████████████████████████████████████████████████████████████████████████
-- MIGRATION 7: Pricing Intelligence 2.0 (20260405000000)
-- Price watches, alerts, materialized view UPGRADE, indexes
-- ████████████████████████████████████████████████████████████████████████████

-- ── 7.1 Price Watches ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS price_watches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  uf TEXT,
  modalidade TEXT,
  threshold_type TEXT NOT NULL DEFAULT 'below_median'
    CHECK (threshold_type IN ('below_median', 'above_value', 'below_value', 'variation_pct')),
  threshold_value NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  last_price NUMERIC,
  notification_channels TEXT[] DEFAULT '{email}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_watches_company ON price_watches(company_id);
CREATE INDEX IF NOT EXISTS idx_price_watches_active ON price_watches(is_active) WHERE is_active = true;

ALTER TABLE price_watches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own price watches"
  ON price_watches FOR ALL
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

-- ── 7.2 Price Watch Alerts ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS price_watch_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_watch_id UUID NOT NULL REFERENCES price_watches(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_price NUMERIC,
  new_price NUMERIC,
  variation_pct NUMERIC,
  details JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_price_watch_alerts_watch ON price_watch_alerts(price_watch_id);
CREATE INDEX IF NOT EXISTS idx_price_watch_alerts_unread ON price_watch_alerts(price_watch_id) WHERE read_at IS NULL;

ALTER TABLE price_watch_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alerts"
  ON price_watch_alerts FOR SELECT
  USING (price_watch_id IN (
    SELECT id FROM price_watches WHERE company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  ));

-- ── 7.3 UPGRADE Materialized View: competitor_bid_patterns ─────────────────
-- Dropa a versao simples (da Migration 4) e recria com colunas completas
-- para o Pricing Intelligence 2.0 + colunas legado para lance-simulator

DROP MATERIALIZED VIEW IF EXISTS competitor_bid_patterns;

CREATE MATERIALIZED VIEW competitor_bid_patterns AS
SELECT
  c.cnpj,
  c.nome AS nome_fornecedor,
  c.porte,
  c.uf_fornecedor,
  -- Colunas para Pricing Intelligence 2.0 (competitor-profile API)
  COUNT(*) AS total_bids,
  COUNT(*) FILTER (WHERE c.situacao IN ('Informado', 'Homologado')) AS total_wins,
  ROUND(
    COUNT(*) FILTER (WHERE c.situacao IN ('Informado', 'Homologado'))::numeric /
    NULLIF(COUNT(*), 0) * 100, 2
  ) AS win_rate,
  AVG(c.valor_proposta) AS avg_bid,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c.valor_proposta) AS median_bid,
  MIN(c.valor_proposta) AS min_bid,
  MAX(c.valor_proposta) AS max_bid,
  AVG(
    CASE WHEN t.valor_estimado > 0
    THEN (t.valor_estimado - c.valor_proposta) / t.valor_estimado * 100
    END
  ) AS avg_discount,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY CASE WHEN t.valor_estimado > 0
    THEN (t.valor_estimado - c.valor_proposta) / t.valor_estimado * 100
    END
  ) AS median_discount,
  -- Colunas legado (lance-simulator compatibility)
  ROUND(AVG(
    CASE WHEN t.valor_estimado > 0 AND c.valor_proposta > 0
    THEN ((t.valor_estimado - c.valor_proposta) / t.valor_estimado * 100)::numeric
    END
  ), 2) AS desconto_medio_pct,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
    CASE WHEN t.valor_estimado > 0 AND c.valor_proposta > 0
    THEN ((t.valor_estimado - c.valor_proposta) / t.valor_estimado * 100)::numeric
    END
  ), 2) AS desconto_mediano_pct,
  MIN(CASE WHEN t.valor_estimado > 0 AND c.valor_proposta > 0
    THEN ((t.valor_estimado - c.valor_proposta) / t.valor_estimado * 100)::numeric
    END) AS desconto_min_pct,
  MAX(CASE WHEN t.valor_estimado > 0 AND c.valor_proposta > 0
    THEN ((t.valor_estimado - c.valor_proposta) / t.valor_estimado * 100)::numeric
    END) AS desconto_max_pct,
  array_agg(DISTINCT t.uf) FILTER (WHERE t.uf IS NOT NULL) AS ufs_atuacao,
  MIN(t.data_encerramento) AS first_seen,
  MAX(t.data_encerramento) AS last_seen
FROM competitors c
JOIN tenders t ON c.tender_id = t.id
WHERE c.valor_proposta > 0 AND c.valor_proposta < 1e12
  AND c.cnpj IS NOT NULL
GROUP BY c.cnpj, c.nome, c.porte, c.uf_fornecedor
HAVING COUNT(*) >= 2;

CREATE UNIQUE INDEX idx_cbp_cnpj ON competitor_bid_patterns(cnpj);

-- ── 7.4 Refresh functions ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_competitor_bid_patterns()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY competitor_bid_patterns;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION refresh_bid_patterns()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY competitor_bid_patterns;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 7.5 Additional indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_competitors_tender_valor
  ON competitors(tender_id, valor_proposta)
  WHERE valor_proposta > 0;

CREATE INDEX IF NOT EXISTS idx_tenders_data_enc_month
  ON tenders(date_trunc('month', data_encerramento))
  WHERE data_encerramento IS NOT NULL;


-- ████████████████████████████████████████████████████████████████████████████
-- POS-MIGRATION: Primeiro refresh da materialized view
-- ████████████████████████████████████████████████████████████████████████████

SELECT refresh_competitor_bid_patterns();


-- ████████████████████████████████████████████████████████████████████████████
-- (OPCIONAL) Cron para refresh automatico a cada 6 horas
-- Requer extensao pg_cron habilitada no Supabase
-- ████████████████████████████████████████████████████████████████████████████

-- Descomente as linhas abaixo se pg_cron estiver habilitado:
-- SELECT cron.schedule(
--   'refresh-competitor-patterns',
--   '0 */6 * * *',
--   'SELECT refresh_competitor_bid_patterns()'
-- );
