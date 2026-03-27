-- Add cnae_grupo (4-digit CNAE group) to competitor_stats for more precise competitor matching.
-- cnae_divisao (2-digit) is kept for backward compatibility and broad sector grouping.

ALTER TABLE public.competitor_stats ADD COLUMN IF NOT EXISTS cnae_grupo TEXT;

-- Index for 4-digit group lookups (used by competitor discovery and hot-alerts)
CREATE INDEX IF NOT EXISTS idx_competitor_stats_cnae_grupo ON competitor_stats (cnae_grupo);

-- Backfill cnae_grupo from cnae_divisao where we have raw CNAE codes in competitors table
UPDATE competitor_stats cs
SET cnae_grupo = sub.grupo
FROM (
  SELECT c.cnpj, MAX(LEFT(c.cnae_codigo::TEXT, 4)) AS grupo
  FROM competitors c
  WHERE c.cnae_codigo IS NOT NULL AND LENGTH(c.cnae_codigo::TEXT) >= 4
  GROUP BY c.cnpj
) sub
WHERE cs.cnpj = sub.cnpj AND cs.cnae_grupo IS NULL;

-- Update materialization function to also populate cnae_grupo
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
      cnpj, razao_social, porte, cnae_divisao, cnae_grupo, uf,
      total_participacoes, total_vitorias, win_rate,
      valor_total_ganho, desconto_medio,
      modalidades, ufs_atuacao, orgaos_frequentes,
      ultima_participacao, updated_at
    )
    SELECT
      c.cnpj,
      MAX(c.nome),
      MAX(c.porte),
      MAX(LEFT(c.cnae_codigo::TEXT, 2)),
      MAX(CASE WHEN LENGTH(c.cnae_codigo::TEXT) >= 4 THEN LEFT(c.cnae_codigo::TEXT, 4) ELSE NULL END),
      MAX(c.uf_fornecedor),
      COUNT(*),
      COUNT(*) FILTER (WHERE LOWER(c.situacao) LIKE '%homologad%'),
      CASE WHEN COUNT(*) > 0
        THEN COUNT(*) FILTER (WHERE LOWER(c.situacao) LIKE '%homologad%')::NUMERIC / COUNT(*)
        ELSE 0 END,
      COALESCE(SUM(c.valor_proposta) FILTER (WHERE LOWER(c.situacao) LIKE '%homologad%'), 0),
      AVG(
        CASE WHEN t.valor_estimado > 0 AND c.valor_proposta > 0 AND c.valor_proposta <= t.valor_estimado
        THEN (t.valor_estimado - c.valor_proposta) / t.valor_estimado
        ELSE NULL END
      ),
      (SELECT COALESCE(jsonb_object_agg(mod_nome, true), '{}') FROM (
        SELECT DISTINCT t2.modalidade_nome as mod_nome
        FROM competitors c2 JOIN tenders t2 ON c2.tender_id = t2.id
        WHERE c2.cnpj = c.cnpj AND t2.modalidade_nome IS NOT NULL
      ) sub),
      (SELECT COALESCE(jsonb_object_agg(uf_val, true), '{}') FROM (
        SELECT DISTINCT t2.uf as uf_val FROM competitors c2
        JOIN tenders t2 ON c2.tender_id = t2.id
        WHERE c2.cnpj = c.cnpj AND t2.uf IS NOT NULL
      ) sub),
      (SELECT COALESCE(jsonb_object_agg(orgao, true), '{}') FROM (
        SELECT DISTINCT t2.orgao as orgao FROM competitors c2
        JOIN tenders t2 ON c2.tender_id = t2.id
        WHERE c2.cnpj = c.cnpj AND t2.orgao IS NOT NULL
        LIMIT 10
      ) sub),
      MAX(c.created_at),
      now()
    FROM competitors c
    JOIN tenders t ON c.tender_id = t.id
    WHERE c.cnpj = ANY(p_cnpjs)
    GROUP BY c.cnpj
    HAVING COUNT(*) >= 1
    ON CONFLICT (cnpj) DO UPDATE SET
      razao_social = EXCLUDED.razao_social,
      porte = EXCLUDED.porte,
      cnae_divisao = EXCLUDED.cnae_divisao,
      cnae_grupo = EXCLUDED.cnae_grupo,
      uf = EXCLUDED.uf,
      total_participacoes = EXCLUDED.total_participacoes,
      total_vitorias = EXCLUDED.total_vitorias,
      win_rate = EXCLUDED.win_rate,
      valor_total_ganho = EXCLUDED.valor_total_ganho,
      desconto_medio = EXCLUDED.desconto_medio,
      modalidades = EXCLUDED.modalidades,
      ufs_atuacao = EXCLUDED.ufs_atuacao,
      orgaos_frequentes = EXCLUDED.orgaos_frequentes,
      ultima_participacao = EXCLUDED.ultima_participacao,
      updated_at = now()
    RETURNING 1
  )
  SELECT COUNT(*) INTO affected FROM upserted;
  RETURN affected;
END;
$$ LANGUAGE plpgsql;

-- Update the find_competitors_by_cnae_uf RPC to support both cnae_grupo (4-digit) and cnae_divisao (2-digit)
-- The parameter name stays the same for backward compatibility, but now tries cnae_grupo first
CREATE OR REPLACE FUNCTION find_competitors_by_cnae_uf(p_cnae_divisao TEXT, p_uf TEXT, p_limit INTEGER DEFAULT 50)
RETURNS SETOF competitor_stats AS $$
BEGIN
  -- If caller passes a 4-digit code, match on cnae_grupo first for precision
  IF LENGTH(p_cnae_divisao) >= 4 THEN
    RETURN QUERY
      SELECT cs.*
      FROM competitor_stats cs
      WHERE cs.ufs_atuacao ? p_uf
        AND cs.cnae_grupo = LEFT(p_cnae_divisao, 4)
      ORDER BY cs.total_participacoes DESC
      LIMIT p_limit;

    -- If we got results, we're done
    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  -- Fallback: match on 2-digit cnae_divisao (broader match)
  RETURN QUERY
    SELECT cs.*
    FROM competitor_stats cs
    WHERE cs.ufs_atuacao ? p_uf
      AND cs.cnae_divisao = LEFT(p_cnae_divisao, 2)
    ORDER BY cs.total_participacoes DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
