-- =============================================================================
-- Migration: bid_outcomes
-- Description: Track tender bid outcomes (won/lost/pending) per company match
-- =============================================================================

-- 1. Create bid_outcomes table
CREATE TABLE IF NOT EXISTS bid_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tender_id UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('won', 'lost', 'did_not_participate', 'pending')),
  reported_via TEXT CHECK (reported_via IN ('telegram', 'whatsapp', 'dashboard', 'auto_detected')),
  reported_at TIMESTAMPTZ DEFAULT NOW(),
  valor_proposta NUMERIC(15,2),
  valor_homologado NUMERIC(15,2),
  motivo_perda TEXT,
  concorrente_vencedor TEXT,
  notas TEXT,
  auto_detected BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_bid_outcomes_company ON bid_outcomes(company_id);
CREATE INDEX idx_bid_outcomes_match ON bid_outcomes(match_id);
CREATE INDEX idx_bid_outcomes_outcome ON bid_outcomes(outcome);
CREATE INDEX idx_bid_outcomes_reported_at ON bid_outcomes(reported_at);
CREATE UNIQUE INDEX idx_bid_outcomes_match_unique ON bid_outcomes(match_id);

-- RLS
ALTER TABLE bid_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company outcomes"
  ON bid_outcomes FOR SELECT
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can insert own company outcomes"
  ON bid_outcomes FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can update own company outcomes"
  ON bid_outcomes FOR UPDATE
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Service role full access bid_outcomes"
  ON bid_outcomes FOR ALL
  USING (auth.role() = 'service_role');

-- =============================================================================
-- 2. RPC: get_company_win_stats
-- =============================================================================

CREATE OR REPLACE FUNCTION get_company_win_stats(p_company_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_outcomes', COUNT(*),
    'won', COUNT(*) FILTER (WHERE outcome = 'won'),
    'lost', COUNT(*) FILTER (WHERE outcome = 'lost'),
    'did_not_participate', COUNT(*) FILTER (WHERE outcome = 'did_not_participate'),
    'pending', COUNT(*) FILTER (WHERE outcome = 'pending'),
    'win_rate', CASE
      WHEN COUNT(*) FILTER (WHERE outcome IN ('won', 'lost')) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE outcome = 'won')::NUMERIC /
           COUNT(*) FILTER (WHERE outcome IN ('won', 'lost'))::NUMERIC * 100, 1)
      ELSE 0
    END,
    'valor_total_ganho', COALESCE(SUM(valor_homologado) FILTER (WHERE outcome = 'won'), 0),
    'last_30_days', json_build_object(
      'won', COUNT(*) FILTER (WHERE outcome = 'won' AND reported_at >= NOW() - INTERVAL '30 days'),
      'lost', COUNT(*) FILTER (WHERE outcome = 'lost' AND reported_at >= NOW() - INTERVAL '30 days'),
      'total', COUNT(*) FILTER (WHERE outcome IN ('won', 'lost') AND reported_at >= NOW() - INTERVAL '30 days')
    )
  ) INTO result
  FROM bid_outcomes
  WHERE company_id = p_company_id;

  RETURN result;
END;
$$;

-- =============================================================================
-- 3. RPC: get_pending_outcome_matches
-- =============================================================================

CREATE OR REPLACE FUNCTION get_pending_outcome_matches(p_company_id UUID, p_limit INT DEFAULT 10)
RETURNS TABLE(
  match_id UUID,
  tender_id UUID,
  tender_objeto TEXT,
  tender_orgao TEXT,
  tender_uf TEXT,
  data_encerramento TIMESTAMPTZ,
  match_score INTEGER,
  days_since_close INTEGER
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id as match_id,
    m.tender_id,
    t.objeto as tender_objeto,
    t.orgao_nome as tender_orgao,
    t.uf as tender_uf,
    t.data_encerramento,
    m.score as match_score,
    EXTRACT(DAY FROM NOW() - t.data_encerramento)::INTEGER as days_since_close
  FROM matches m
  JOIN tenders t ON t.id = m.tender_id
  WHERE m.company_id = p_company_id
    AND m.status IN ('notified', 'viewed', 'interested', 'applied')
    AND t.data_encerramento IS NOT NULL
    AND t.data_encerramento < NOW() - INTERVAL '6 hours'
    AND t.data_encerramento > NOW() - INTERVAL '30 days'
    AND NOT EXISTS (
      SELECT 1 FROM bid_outcomes bo WHERE bo.match_id = m.id
    )
  ORDER BY t.data_encerramento DESC
  LIMIT p_limit;
END;
$$;
