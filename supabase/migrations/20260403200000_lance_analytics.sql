-- ============================================================
-- Feature 6: Simulador de Lance / Pré-Disputa
-- ============================================================

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
