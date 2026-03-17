-- competitor_stats table
CREATE TABLE IF NOT EXISTS public.competitor_stats (
  cnpj TEXT PRIMARY KEY,
  nome TEXT,
  total_participations INTEGER DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  win_rate NUMERIC(5,4) DEFAULT 0,
  avg_valor_proposta NUMERIC(15,2),
  avg_discount_pct NUMERIC(5,4),
  participations_by_uf JSONB DEFAULT '{}',
  wins_by_uf JSONB DEFAULT '{}',
  participations_by_cnae JSONB DEFAULT '{}',
  wins_by_cnae JSONB DEFAULT '{}',
  modalidades JSONB DEFAULT '{}',
  porte TEXT,
  uf_sede TEXT,
  municipio_sede TEXT,
  last_participation_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitor_stats_uf ON competitor_stats (uf_sede);
CREATE INDEX IF NOT EXISTS idx_competitor_stats_porte ON competitor_stats (porte);
CREATE INDEX IF NOT EXISTS idx_competitor_stats_wins ON competitor_stats (total_wins DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_stats_cnae_gin ON competitor_stats USING GIN (participations_by_cnae);
CREATE INDEX IF NOT EXISTS idx_competitor_stats_uf_gin ON competitor_stats USING GIN (participations_by_uf);

ALTER TABLE public.competitor_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY competitor_stats_select_authenticated ON public.competitor_stats
  FOR SELECT TO authenticated USING (true);

-- competition_score on matches
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS competition_score INTEGER
  CHECK (competition_score >= 0 AND competition_score <= 100);

-- Index for incremental materialization
CREATE INDEX IF NOT EXISTS idx_competitors_created_at ON public.competitors (created_at);

-- RPC function for materialization
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
      (SELECT COALESCE(jsonb_object_agg(mod_id::TEXT, cnt), '{}') FROM (
        SELECT t2.modalidade_id as mod_id, COUNT(*) as cnt
        FROM competitors c2 JOIN tenders t2 ON c2.tender_id = t2.id
        WHERE c2.cnpj = c.cnpj AND t2.modalidade_id IS NOT NULL GROUP BY t2.modalidade_id
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
    HAVING COUNT(*) >= 3
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

-- RPC to find competitors by CNAE divisions AND UF (uses GIN ? operator, not expressible via Supabase JS)
CREATE OR REPLACE FUNCTION find_competitors_by_cnae_uf(p_cnae_divisions TEXT[], p_uf TEXT)
RETURNS SETOF competitor_stats AS $$
BEGIN
  RETURN QUERY
    SELECT cs.*
    FROM competitor_stats cs
    WHERE cs.participations_by_uf ? p_uf
      AND EXISTS (
        SELECT 1 FROM unnest(p_cnae_divisions) d
        WHERE cs.participations_by_cnae ? d
      )
    ORDER BY cs.total_participations DESC
    LIMIT 50;
END;
$$ LANGUAGE plpgsql STABLE;

-- RPC to get all CNPJs with minimum participations (for full materialization mode)
CREATE OR REPLACE FUNCTION get_all_competitor_cnpjs_with_min_participations(min_count INTEGER)
RETURNS TABLE(cnpj TEXT) AS $$
BEGIN
  RETURN QUERY
    SELECT c.cnpj
    FROM competitors c
    WHERE c.cnpj IS NOT NULL
    GROUP BY c.cnpj
    HAVING COUNT(*) >= min_count;
END;
$$ LANGUAGE plpgsql STABLE;
