-- ============================================================================
-- RPC: search_tenders_with_bids
-- Used by benchmarking, discount-analysis, and seasonality API routes
-- Joins tenders + competitors with full-text search on objeto
-- FIX: Cast char(2) columns to text to avoid type mismatch
-- ============================================================================

DROP FUNCTION IF EXISTS search_tenders_with_bids(text, text, text, text, text, integer);

CREATE OR REPLACE FUNCTION search_tenders_with_bids(
  p_query text,
  p_uf text DEFAULT NULL,
  p_modalidade text DEFAULT NULL,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  tender_id uuid,
  objeto text,
  valor_proposta numeric,
  valor_estimado numeric,
  situacao text,
  uf text,
  nome text,
  cnpj text,
  porte text,
  orgao_nome text,
  modalidade_nome text,
  data_encerramento timestamptz,
  data_publicacao timestamptz,
  num_competitors integer
)
LANGUAGE sql STABLE
AS $$
  WITH matched_tenders AS (
    SELECT t.id
    FROM tenders t
    WHERE
      t.objeto @@ websearch_to_tsquery('portuguese', p_query)
      AND (p_uf IS NULL OR t.uf = p_uf)
      AND (p_modalidade IS NULL OR t.modalidade_nome = p_modalidade)
      AND (p_date_from IS NULL OR t.data_encerramento >= p_date_from::timestamptz)
      AND (p_date_to IS NULL OR t.data_encerramento <= p_date_to::timestamptz)
    ORDER BY t.data_encerramento DESC NULLS LAST
    LIMIT p_limit
  )
  SELECT
    t.id AS tender_id,
    t.objeto,
    c.valor_proposta,
    t.valor_estimado,
    c.situacao::text,
    t.uf::text,
    c.nome::text,
    c.cnpj::text,
    COALESCE(c.porte, 'N/A')::text AS porte,
    t.orgao_nome::text,
    t.modalidade_nome::text,
    t.data_encerramento,
    t.data_publicacao,
    (SELECT COUNT(*)::integer FROM competitors c2 WHERE c2.tender_id = t.id AND c2.valor_proposta > 0) AS num_competitors
  FROM matched_tenders mt
  INNER JOIN tenders t ON t.id = mt.id
  INNER JOIN competitors c ON c.tender_id = t.id
  WHERE c.valor_proposta > 0
  ORDER BY t.data_encerramento DESC NULLS LAST;
$$;
