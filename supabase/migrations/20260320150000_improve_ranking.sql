-- Improved competitor ranking RPC
-- Changes: lower min_score default, higher limit, adds discovery_source column,
-- includes ALL competitors (not just high-score), sorted by composite rank

-- Add discovery_source to track how competitor was found
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'competitor_relevance' AND column_name = 'discovery_source'
  ) THEN
    ALTER TABLE competitor_relevance ADD COLUMN discovery_source TEXT DEFAULT 'tender_overlap';
  END IF;
END $$;

-- Drop and recreate with better logic
CREATE OR REPLACE FUNCTION get_relevant_competitors(
  p_company_id UUID,
  p_min_score INTEGER DEFAULT 0,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
  competitor_cnpj TEXT,
  competitor_nome TEXT,
  relevance_score INTEGER,
  relationship_type TEXT,
  reason TEXT,
  shared_tender_count INTEGER,
  discovery_source TEXT,
  win_rate NUMERIC,
  total_participacoes INTEGER,
  total_vitorias INTEGER,
  valor_total_ganho NUMERIC,
  porte TEXT,
  uf TEXT,
  cnae_divisao INTEGER,
  segmento_ia TEXT,
  nivel_ameaca TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.competitor_cnpj,
    COALESCE(cr.competitor_nome, cs.razao_social) AS competitor_nome,
    cr.relevance_score,
    cr.relationship_type,
    cr.reason,
    cr.shared_tender_count,
    COALESCE(cr.discovery_source, 'tender_overlap') AS discovery_source,
    cs.win_rate,
    cs.total_participacoes,
    cs.total_vitorias,
    cs.valor_total_ganho,
    cs.porte,
    cs.uf,
    cs.cnae_divisao,
    cs.segmento_ia,
    cs.nivel_ameaca
  FROM competitor_relevance cr
  LEFT JOIN competitor_stats cs ON cs.cnpj = cr.competitor_cnpj
  WHERE cr.company_id = p_company_id
    AND cr.relevance_score >= p_min_score
    AND cr.relationship_type != 'irrelevante'
  ORDER BY
    -- Composite ranking: prioritize direct competitors, then by score, then by shared tenders
    CASE cr.relationship_type
      WHEN 'concorrente_direto' THEN 1
      WHEN 'concorrente_indireto' THEN 2
      WHEN 'potencial_parceiro' THEN 3
      ELSE 4
    END,
    cr.relevance_score DESC,
    cr.shared_tender_count DESC
  LIMIT p_limit;
END;
$$;

-- Also add a summary RPC for the ranking header
CREATE OR REPLACE FUNCTION get_competitor_summary(p_company_id UUID)
RETURNS TABLE(
  total_analyzed INTEGER,
  direct_count INTEGER,
  indirect_count INTEGER,
  partner_count INTEGER,
  avg_relevance NUMERIC,
  last_analyzed TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER AS total_analyzed,
    COUNT(*) FILTER (WHERE cr.relationship_type = 'concorrente_direto')::INTEGER AS direct_count,
    COUNT(*) FILTER (WHERE cr.relationship_type = 'concorrente_indireto')::INTEGER AS indirect_count,
    COUNT(*) FILTER (WHERE cr.relationship_type = 'potencial_parceiro')::INTEGER AS partner_count,
    ROUND(AVG(cr.relevance_score), 1) AS avg_relevance,
    MAX(cr.analyzed_at) AS last_analyzed
  FROM competitor_relevance cr
  WHERE cr.company_id = p_company_id
    AND cr.relationship_type != 'irrelevante';
END;
$$;
