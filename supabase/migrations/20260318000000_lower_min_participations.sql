-- Lower HAVING threshold from 3 to 1 in materialize_competitor_stats
-- so new clients see competitive intelligence data immediately (even with
-- competitors that have only 1 participation).

CREATE OR REPLACE FUNCTION materialize_competitor_stats(p_cnpjs TEXT[])
RETURNS INTEGER AS $$
DECLARE
  affected INTEGER;
BEGIN
  IF array_length(p_cnpjs, 1) IS NULL THEN
    RETURN 0;
  END IF;

  WITH upserted AS (
    INSERT INTO competitor_stats (
      cnpj, nome, total_participations, total_wins, win_rate,
      avg_valor_proposta, avg_discount_pct,
      participations_by_uf, wins_by_uf,
      participations_by_cnae, wins_by_cnae,
      modalidades, porte, uf_sede, municipio_sede,
      last_participation_at, updated_at
    )
    SELECT
      c.cnpj,
      MAX(c.nome),
      COUNT(*),
      COUNT(*) FILTER (WHERE LOWER(c.situacao) LIKE '%homologad%'),
      CASE WHEN COUNT(*) > 0
        THEN COUNT(*) FILTER (WHERE LOWER(c.situacao) LIKE '%homologad%')::NUMERIC / COUNT(*)
        ELSE 0 END,
      AVG(c.valor_proposta),
      AVG(
        CASE WHEN t.valor_estimado > 0 AND c.valor_proposta > 0 AND c.valor_proposta <= t.valor_estimado
        THEN (t.valor_estimado - c.valor_proposta) / t.valor_estimado
        ELSE NULL END
      ),
      (SELECT COALESCE(jsonb_object_agg(uf, cnt), '{}') FROM (
        SELECT t2.uf, COUNT(*) as cnt FROM competitors c2
        JOIN tenders t2 ON c2.tender_id = t2.id
        WHERE c2.cnpj = c.cnpj AND t2.uf IS NOT NULL GROUP BY t2.uf
      ) sub),
      (SELECT COALESCE(jsonb_object_agg(uf, cnt), '{}') FROM (
        SELECT t2.uf, COUNT(*) as cnt FROM competitors c2
        JOIN tenders t2 ON c2.tender_id = t2.id
        WHERE c2.cnpj = c.cnpj AND t2.uf IS NOT NULL AND LOWER(c2.situacao) LIKE '%homologad%'
        GROUP BY t2.uf
      ) sub),
      (SELECT COALESCE(jsonb_object_agg(cnae_div, cnt), '{}') FROM (
        SELECT LEFT(c2.cnae_codigo::TEXT, 2) as cnae_div, COUNT(*) as cnt
        FROM competitors c2
        WHERE c2.cnpj = c.cnpj AND c2.cnae_codigo IS NOT NULL GROUP BY cnae_div
      ) sub),
      (SELECT COALESCE(jsonb_object_agg(cnae_div, cnt), '{}') FROM (
        SELECT LEFT(c2.cnae_codigo::TEXT, 2) as cnae_div, COUNT(*) as cnt
        FROM competitors c2
        WHERE c2.cnpj = c.cnpj AND c2.cnae_codigo IS NOT NULL AND LOWER(c2.situacao) LIKE '%homologad%'
        GROUP BY cnae_div
      ) sub),
      (SELECT COALESCE(jsonb_object_agg(mod_nome, cnt), '{}') FROM (
        SELECT t2.modalidade_nome as mod_nome, COUNT(*) as cnt
        FROM competitors c2
        JOIN tenders t2 ON c2.tender_id = t2.id
        WHERE c2.cnpj = c.cnpj AND t2.modalidade_nome IS NOT NULL GROUP BY t2.modalidade_nome
      ) sub),
      MAX(c.porte),
      MAX(c.uf_fornecedor),
      MAX(c.municipio_fornecedor),
      MAX(c.created_at),
      now()
    FROM competitors c
    JOIN tenders t ON c.tender_id = t.id
    WHERE c.cnpj = ANY(p_cnpjs)
    GROUP BY c.cnpj
    HAVING COUNT(*) >= 1
    ON CONFLICT (cnpj) DO UPDATE SET
      nome = EXCLUDED.nome,
      total_participations = EXCLUDED.total_participations,
      total_wins = EXCLUDED.total_wins,
      win_rate = EXCLUDED.win_rate,
      avg_valor_proposta = EXCLUDED.avg_valor_proposta,
      avg_discount_pct = EXCLUDED.avg_discount_pct,
      participations_by_uf = EXCLUDED.participations_by_uf,
      wins_by_uf = EXCLUDED.wins_by_uf,
      participations_by_cnae = EXCLUDED.participations_by_cnae,
      wins_by_cnae = EXCLUDED.wins_by_cnae,
      modalidades = EXCLUDED.modalidades,
      porte = EXCLUDED.porte,
      uf_sede = EXCLUDED.uf_sede,
      municipio_sede = EXCLUDED.municipio_sede,
      last_participation_at = EXCLUDED.last_participation_at,
      updated_at = now()
    RETURNING 1
  )
  SELECT COUNT(*) INTO affected FROM upserted;
  RETURN affected;
END;
$$ LANGUAGE plpgsql;
