-- Competitive intelligence: competitor_stats materialized view + helper RPCs
-- NOTE: This migration reflects the PRODUCTION schema (Portuguese column names).

-- competitor_stats table
CREATE TABLE IF NOT EXISTS public.competitor_stats (
  cnpj TEXT PRIMARY KEY,
  razao_social TEXT,
  porte TEXT,
  cnae_divisao TEXT,
  uf TEXT,
  total_participacoes INTEGER DEFAULT 0,
  total_vitorias INTEGER DEFAULT 0,
  win_rate NUMERIC(5,4) DEFAULT 0,
  valor_total_ganho NUMERIC(15,2) DEFAULT 0,
  desconto_medio NUMERIC(5,4) DEFAULT 0,
  modalidades JSONB DEFAULT '{}',
  ufs_atuacao JSONB DEFAULT '{}',
  orgaos_frequentes JSONB DEFAULT '{}',
  ultima_participacao TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitor_stats_uf ON competitor_stats (uf);
CREATE INDEX IF NOT EXISTS idx_competitor_stats_porte ON competitor_stats (porte);
CREATE INDEX IF NOT EXISTS idx_competitor_stats_participacoes ON competitor_stats (total_participacoes DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_stats_ufs_gin ON competitor_stats USING GIN (ufs_atuacao);

ALTER TABLE public.competitor_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS competitor_stats_select_authenticated ON public.competitor_stats;
CREATE POLICY competitor_stats_select_authenticated ON public.competitor_stats
  FOR SELECT TO authenticated USING (true);

-- competition_score on matches
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS competition_score INTEGER
  CHECK (competition_score >= 0 AND competition_score <= 100);

-- Index for incremental materialization
CREATE INDEX IF NOT EXISTS idx_competitors_created_at ON public.competitors (created_at);

-- RPC function for materialization (HAVING >= 1 so stats appear immediately)
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
      cnpj, razao_social, porte, cnae_divisao, uf,
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

-- RPC to find competitors by single CNAE division AND UF
-- Callers loop over CNAE divisions individually (hot-alerts, opportunity detail page)
CREATE OR REPLACE FUNCTION find_competitors_by_cnae_uf(p_cnae_divisao TEXT, p_uf TEXT, p_limit INTEGER DEFAULT 50)
RETURNS SETOF competitor_stats AS $$
BEGIN
  RETURN QUERY
    SELECT cs.*
    FROM competitor_stats cs
    WHERE cs.ufs_atuacao ? p_uf
      AND cs.cnae_divisao = p_cnae_divisao
    ORDER BY cs.total_participacoes DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- RPC to get all CNPJs with minimum participations (for full materialization mode)
CREATE OR REPLACE FUNCTION get_all_competitor_cnpjs_with_min_participations(p_min_participations INTEGER)
RETURNS TABLE(cnpj TEXT) AS $$
BEGIN
  RETURN QUERY
    SELECT c.cnpj
    FROM competitors c
    WHERE c.cnpj IS NOT NULL
    GROUP BY c.cnpj
    HAVING COUNT(*) >= p_min_participations;
END;
$$ LANGUAGE plpgsql STABLE;
