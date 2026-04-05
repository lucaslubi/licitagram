-- ============================================================================
-- Migration: Pricing Intelligence 2.0 Tables
-- Created: 2026-04-05
-- Description: Creates tables, materialized views, and indexes for the
--              Pricing Intelligence 2.0 system including price watches,
--              alert history, competitor bid patterns, and optimized indexes.
-- ============================================================================

-- ============================================================================
-- 1. Price Watches — Price alert monitoring
-- ============================================================================

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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_price_watches_company ON price_watches(company_id);
CREATE INDEX IF NOT EXISTS idx_price_watches_active ON price_watches(is_active) WHERE is_active = true;

-- RLS
ALTER TABLE price_watches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own price watches"
  ON price_watches FOR ALL
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

-- ============================================================================
-- 2. Price Watch Alerts — Alert history
-- ============================================================================

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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_price_watch_alerts_watch ON price_watch_alerts(price_watch_id);
CREATE INDEX IF NOT EXISTS idx_price_watch_alerts_unread ON price_watch_alerts(price_watch_id) WHERE read_at IS NULL;

-- RLS
ALTER TABLE price_watch_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alerts"
  ON price_watch_alerts FOR SELECT
  USING (price_watch_id IN (
    SELECT id FROM price_watches WHERE company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  ));

-- ============================================================================
-- 3. Materialized View: Competitor Bid Patterns (UPGRADED)
-- Drops any existing version (from lance_analytics migration) and recreates
-- with columns aligned to the competitor-profile API expectations.
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS competitor_bid_patterns;

CREATE MATERIALIZED VIEW competitor_bid_patterns AS
SELECT
  c.cnpj,
  c.nome AS nome_fornecedor,
  c.porte,
  c.uf_fornecedor,
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
  -- Keep legacy column names for lance-simulator compatibility
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

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX idx_cbp_cnpj ON competitor_bid_patterns(cnpj);

-- ============================================================================
-- 4. Functions to refresh materialized view (called by cron or manually)
-- ============================================================================

-- New function name (for pricing intelligence)
CREATE OR REPLACE FUNCTION refresh_competitor_bid_patterns()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY competitor_bid_patterns;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Keep legacy function name (for lance simulator)
CREATE OR REPLACE FUNCTION refresh_bid_patterns()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY competitor_bid_patterns;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. Additional indexes for discount and seasonality queries
-- ============================================================================

-- Composite index for discount analysis queries
CREATE INDEX IF NOT EXISTS idx_competitors_tender_valor
  ON competitors(tender_id, valor_proposta)
  WHERE valor_proposta > 0;

-- Index for seasonality queries (month extraction)
CREATE INDEX IF NOT EXISTS idx_tenders_data_enc_month
  ON tenders(date_trunc('month', data_encerramento))
  WHERE data_encerramento IS NOT NULL;
