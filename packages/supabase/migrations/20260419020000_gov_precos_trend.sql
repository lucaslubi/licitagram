-- ============================================================
-- LICITAGOV: RPC precos_pncp_trend — série mensal agregada
-- Consumida pelo PriceTrendChart da página /precos-mercado (gov).
-- ============================================================

CREATE OR REPLACE FUNCTION public.precos_pncp_trend(
  p_query TEXT,
  p_uf TEXT DEFAULT NULL,
  p_modalidade TEXT DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_meses INTEGER DEFAULT 12
)
RETURNS TABLE (
  mes TEXT,           -- 'YYYY-MM'
  n INTEGER,
  media NUMERIC,
  mediana NUMERIC,
  minimo NUMERIC,
  maximo NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  WITH amostra AS (
    SELECT
      to_char(v.data_publicacao, 'YYYY-MM') AS mes,
      v.valor_unitario_estimado AS valor
    FROM licitagov.v_precos_historicos v
    WHERE v.descricao ILIKE '%' || p_query || '%'
      AND v.data_publicacao IS NOT NULL
      AND (p_uf IS NULL OR v.orgao_nome ILIKE '%' || p_uf || '%')
      AND (p_modalidade IS NULL OR v.modalidade_nome ILIKE '%' || p_modalidade || '%')
      AND (p_date_from IS NULL OR v.data_publicacao >= p_date_from)
      AND (p_date_to IS NULL OR v.data_publicacao <= p_date_to)
      AND v.data_publicacao >= NOW() - (GREATEST(1, LEAST(COALESCE(p_meses, 12), 60)) || ' months')::interval
  )
  SELECT
    mes,
    COUNT(*)::INTEGER AS n,
    ROUND(AVG(valor)::numeric, 2) AS media,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY valor)::numeric, 2) AS mediana,
    ROUND(MIN(valor)::numeric, 2) AS minimo,
    ROUND(MAX(valor)::numeric, 2) AS maximo
  FROM amostra
  GROUP BY mes
  ORDER BY mes
$$;
GRANT EXECUTE ON FUNCTION public.precos_pncp_trend(TEXT, TEXT, TEXT, DATE, DATE, INTEGER) TO authenticated;
