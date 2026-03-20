-- Competitor Relevance: AI-powered contextual relevance scoring
-- Replaces naive co-occurrence counting with deep analysis of
-- CNAE overlap, shared tender objects, and service compatibility.

CREATE TABLE IF NOT EXISTS competitor_relevance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  competitor_cnpj TEXT NOT NULL,
  competitor_nome TEXT,
  relevance_score INTEGER NOT NULL DEFAULT 0,
  relationship_type TEXT CHECK (relationship_type IN ('concorrente_direto', 'concorrente_indireto', 'potencial_parceiro', 'irrelevante')),
  reason TEXT,
  shared_tender_count INTEGER DEFAULT 0,
  shared_tender_objects TEXT[], -- sample of shared tender objects for audit
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, competitor_cnpj)
);

CREATE INDEX idx_comp_rel_company ON competitor_relevance(company_id);
CREATE INDEX idx_comp_rel_score ON competitor_relevance(company_id, relevance_score DESC);
CREATE INDEX idx_comp_rel_type ON competitor_relevance(relationship_type);

ALTER TABLE competitor_relevance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own company relevance" ON competitor_relevance
  FOR SELECT USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Service role full access" ON competitor_relevance
  FOR ALL USING (auth.role() = 'service_role');

-- RPC for getting ranked competitors with relevance filtering
CREATE OR REPLACE FUNCTION get_relevant_competitors(
  p_company_id UUID,
  p_min_score INTEGER DEFAULT 40,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
  competitor_cnpj TEXT,
  competitor_nome TEXT,
  relevance_score INTEGER,
  relationship_type TEXT,
  reason TEXT,
  shared_tender_count INTEGER,
  win_rate NUMERIC,
  total_participacoes INTEGER,
  total_vitorias INTEGER,
  porte TEXT,
  uf TEXT,
  segmento_ia TEXT,
  nivel_ameaca TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.competitor_cnpj,
    cr.competitor_nome,
    cr.relevance_score,
    cr.relationship_type,
    cr.reason,
    cr.shared_tender_count,
    cs.win_rate,
    cs.total_participacoes,
    cs.total_vitorias,
    cs.porte,
    cs.uf,
    cs.segmento_ia,
    cs.nivel_ameaca
  FROM competitor_relevance cr
  LEFT JOIN competitor_stats cs ON cs.cnpj = cr.competitor_cnpj
  WHERE cr.company_id = p_company_id
    AND cr.relevance_score >= p_min_score
  ORDER BY cr.relevance_score DESC
  LIMIT p_limit;
END;
$$;
