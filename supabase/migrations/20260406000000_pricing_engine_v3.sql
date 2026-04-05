-- ============================================================================
-- Pricing Engine v3: Contextual pricing with discount_ratio normalization
-- ============================================================================
-- Key insight: normalize all prices as discount_ratio = valor_proposta / valor_estimado
-- This eliminates variance (R$4 software and R$1M software both cluster around 0.75-0.90)
-- ============================================================================

-- 1. Index for efficient range queries on valor_estimado
CREATE INDEX IF NOT EXISTS idx_tenders_valor_estimado_range
  ON tenders(valor_estimado)
  WHERE valor_estimado > 0;

-- 2. Composite index for contextual queries (FTS + valor_estimado range)
CREATE INDEX IF NOT EXISTS idx_tenders_fts_valor
  ON tenders USING gin(to_tsvector('portuguese', objeto))
  WHERE valor_estimado > 0;

-- 3. RPC function: get_contextual_bids
-- Returns bids within a valor_estimado range for a given search query
CREATE OR REPLACE FUNCTION get_contextual_bids(
  p_query text,
  p_valor_estimado numeric,
  p_band_factor numeric DEFAULT 0.5,
  p_uf text DEFAULT NULL,
  p_modalidade text DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  tender_id uuid,
  objeto text,
  valor_proposta numeric,
  valor_estimado numeric,
  discount_ratio numeric,
  is_winner boolean,
  porte text,
  uf text,
  modalidade_nome text,
  num_competitors integer,
  data_encerramento timestamptz,
  orgao_nome text,
  cnpj text,
  nome text,
  uf_fornecedor text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    t.id AS tender_id,
    t.objeto,
    c.valor_proposta,
    t.valor_estimado,
    ROUND((c.valor_proposta / NULLIF(t.valor_estimado, 0))::numeric, 4) AS discount_ratio,
    c.situacao IN ('Informado', 'Homologado') AS is_winner,
    COALESCE(c.porte, 'N/A') AS porte,
    t.uf,
    t.modalidade_nome,
    (SELECT COUNT(*)::integer FROM competitors c2 WHERE c2.tender_id = t.id AND c2.valor_proposta > 0) AS num_competitors,
    t.data_encerramento,
    t.orgao_nome,
    c.cnpj,
    c.nome,
    c.uf_fornecedor
  FROM tenders t
  INNER JOIN competitors c ON c.tender_id = t.id
  WHERE
    t.objeto @@ websearch_to_tsquery('portuguese', p_query)
    AND t.valor_estimado > 0
    AND c.valor_proposta > 0
    AND c.valor_proposta < 1e12
    AND t.valor_estimado BETWEEN p_valor_estimado * (1.0 - p_band_factor)
                              AND p_valor_estimado * (1.0 + p_band_factor)
    AND (p_uf IS NULL OR t.uf = p_uf)
    AND (p_modalidade IS NULL OR t.modalidade_nome = p_modalidade)
  ORDER BY t.data_encerramento DESC
  LIMIT p_limit;
$$;

-- 4. RPC function: get_price_bands
-- Returns aggregated stats per price band for a given search query
CREATE OR REPLACE FUNCTION get_price_bands(
  p_query text,
  p_uf text DEFAULT NULL,
  p_modalidade text DEFAULT NULL
)
RETURNS TABLE (
  band_id text,
  band_label text,
  band_min numeric,
  band_max numeric,
  total_bids bigint,
  total_wins bigint,
  avg_discount_ratio numeric,
  median_discount_ratio numeric,
  winner_avg_discount_ratio numeric,
  avg_valor_estimado numeric
)
LANGUAGE sql STABLE
AS $$
  WITH bid_data AS (
    SELECT
      c.valor_proposta,
      t.valor_estimado,
      (c.valor_proposta / NULLIF(t.valor_estimado, 0)) AS ratio,
      c.situacao IN ('Informado', 'Homologado') AS is_winner,
      CASE
        WHEN t.valor_estimado < 10000 THEN 'micro'
        WHEN t.valor_estimado < 50000 THEN 'pequeno'
        WHEN t.valor_estimado < 200000 THEN 'medio'
        WHEN t.valor_estimado < 1000000 THEN 'grande'
        ELSE 'mega'
      END AS price_band
    FROM tenders t
    INNER JOIN competitors c ON c.tender_id = t.id
    WHERE
      t.objeto @@ websearch_to_tsquery('portuguese', p_query)
      AND t.valor_estimado > 0
      AND c.valor_proposta > 0
      AND c.valor_proposta < 1e12
      AND (p_uf IS NULL OR t.uf = p_uf)
      AND (p_modalidade IS NULL OR t.modalidade_nome = p_modalidade)
  )
  SELECT
    price_band AS band_id,
    CASE price_band
      WHEN 'micro' THEN 'Até R$ 10 mil'
      WHEN 'pequeno' THEN 'R$ 10 mil - 50 mil'
      WHEN 'medio' THEN 'R$ 50 mil - 200 mil'
      WHEN 'grande' THEN 'R$ 200 mil - 1 milhão'
      WHEN 'mega' THEN 'Acima de R$ 1 milhão'
    END AS band_label,
    CASE price_band
      WHEN 'micro' THEN 0
      WHEN 'pequeno' THEN 10000
      WHEN 'medio' THEN 50000
      WHEN 'grande' THEN 200000
      WHEN 'mega' THEN 1000000
    END::numeric AS band_min,
    CASE price_band
      WHEN 'micro' THEN 10000
      WHEN 'pequeno' THEN 50000
      WHEN 'medio' THEN 200000
      WHEN 'grande' THEN 1000000
      WHEN 'mega' THEN 999999999
    END::numeric AS band_max,
    COUNT(*) AS total_bids,
    COUNT(*) FILTER (WHERE is_winner) AS total_wins,
    ROUND(AVG(ratio)::numeric, 4) AS avg_discount_ratio,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ratio)::numeric, 4) AS median_discount_ratio,
    ROUND(AVG(ratio) FILTER (WHERE is_winner)::numeric, 4) AS winner_avg_discount_ratio,
    ROUND(AVG(valor_estimado)::numeric, 2) AS avg_valor_estimado
  FROM bid_data
  GROUP BY price_band
  HAVING COUNT(*) >= 3
  ORDER BY
    CASE price_band
      WHEN 'micro' THEN 1
      WHEN 'pequeno' THEN 2
      WHEN 'medio' THEN 3
      WHEN 'grande' THEN 4
      WHEN 'mega' THEN 5
    END;
$$;

-- 5. Grant access
GRANT EXECUTE ON FUNCTION get_contextual_bids TO authenticated;
GRANT EXECUTE ON FUNCTION get_price_bands TO authenticated;

-- 6. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
