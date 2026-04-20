-- ============================================================
-- LICITAGOV: montar_cesta_ia — RPC que monta cesta de preços
-- automaticamente aplicando scoring multifator.
--
-- Scoring:
--   - similaridade_desc: trigram sobre descricao vs p_query (peso 0.40)
--   - proximidade_temporal: 1.0 se ≤6m, decai linear até 0 em 36m (peso 0.25)
--   - modalidade_match: 1.0 se match exato de modalidade (peso 0.15)
--   - quantidade_match: 1 - |log(qt/p_qtd)| / 3 clampado [0,1] (peso 0.10)
--   - outlier_penalty: 0 se fora IQR, 1 se dentro (peso 0.10)
--
-- Implementação: pure SQL function com CTEs encadeadas (sem TEMP TABLE).
-- ============================================================

CREATE OR REPLACE FUNCTION public.montar_cesta_ia(
  p_query TEXT,
  p_qtd NUMERIC DEFAULT NULL,
  p_modalidade_preferida TEXT DEFAULT NULL,
  p_meses_back INTEGER DEFAULT 24,
  p_max_fontes INTEGER DEFAULT 8,
  p_min_fontes INTEGER DEFAULT 3
)
RETURNS TABLE (
  origem TEXT,
  ref_id UUID,
  descricao TEXT,
  orgao_nome TEXT,
  modalidade TEXT,
  data_referencia DATE,
  quantidade NUMERIC,
  unidade_medida TEXT,
  valor_unitario NUMERIC,
  fornecedor_nome TEXT,
  link_fonte TEXT,
  score NUMERIC,
  score_similaridade NUMERIC,
  score_temporal NUMERIC,
  score_modalidade NUMERIC,
  score_quantidade NUMERIC,
  score_outlier NUMERIC,
  justificativa TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  WITH candidatos AS (
    SELECT
      'pncp'::TEXT            AS origem,
      h.item_id               AS ref_id,
      h.descricao             AS descricao,
      h.orgao_nome            AS orgao_nome,
      h.modalidade_nome       AS modalidade,
      h.data_publicacao::date AS data_referencia,
      h.quantidade            AS quantidade,
      h.unidade_medida        AS unidade_medida,
      h.valor_unitario_estimado AS valor_unitario,
      NULL::TEXT              AS fornecedor_nome,
      h.link_pncp             AS link_fonte,
      similarity(h.descricao, p_query) AS sim_desc
    FROM licitagov.v_precos_historicos h
    WHERE h.data_publicacao >= (CURRENT_DATE - (p_meses_back || ' months')::INTERVAL)
      AND similarity(h.descricao, p_query) > 0.18
      AND h.valor_unitario_estimado > 0

    UNION ALL

    SELECT
      'painel_oficial'::TEXT,
      pp.id,
      pp.descricao,
      COALESCE(pp.orgao_nome, pp.uasg_nome),
      pp.modalidade,
      pp.data_homologacao,
      pp.quantidade,
      pp.unidade_medida,
      pp.valor_unitario,
      pp.fornecedor_nome,
      pp.fonte_url,
      similarity(COALESCE(pp.descricao, ''), p_query)
    FROM licitagov.painel_precos_oficial pp
    WHERE pp.data_homologacao >= (CURRENT_DATE - (p_meses_back || ' months')::INTERVAL)
      AND similarity(COALESCE(pp.descricao, ''), p_query) > 0.18
      AND pp.valor_unitario > 0
  ),
  iqr_bounds AS (
    SELECT
      percentile_cont(0.25) WITHIN GROUP (ORDER BY valor_unitario) AS q1,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY valor_unitario) AS q3
    FROM candidatos
  ),
  scored AS (
    SELECT
      c.*,
      c.sim_desc AS s_sim,
      GREATEST(0::NUMERIC, LEAST(1::NUMERIC,
        1.0 - GREATEST(0, (CURRENT_DATE - c.data_referencia) - 180)::NUMERIC / 900.0
      )) AS s_temporal,
      CASE
        WHEN p_modalidade_preferida IS NULL THEN 0.5
        WHEN LOWER(COALESCE(c.modalidade, '')) LIKE '%' || LOWER(p_modalidade_preferida) || '%' THEN 1.0
        ELSE 0.2
      END AS s_modalidade,
      CASE
        WHEN p_qtd IS NULL OR c.quantidade IS NULL OR c.quantidade <= 0 THEN 0.5
        ELSE GREATEST(0, 1 - ABS(LOG(c.quantidade::NUMERIC / p_qtd)) / 3)
      END AS s_quantidade,
      CASE
        WHEN (b.q3 - b.q1) = 0 OR b.q1 IS NULL THEN 1
        WHEN c.valor_unitario < (b.q1 - 1.5 * (b.q3 - b.q1))
          OR c.valor_unitario > (b.q3 + 1.5 * (b.q3 - b.q1)) THEN 0
        ELSE 1
      END AS s_outlier
    FROM candidatos c
    CROSS JOIN iqr_bounds b
  ),
  ranked AS (
    SELECT
      s.*,
      (0.40 * s.s_sim + 0.25 * s.s_temporal + 0.15 * s.s_modalidade
       + 0.10 * s.s_quantidade + 0.10 * s.s_outlier)::NUMERIC AS score_final,
      ROW_NUMBER() OVER (
        PARTITION BY s.origem, s.orgao_nome
        ORDER BY (0.40 * s.s_sim + 0.25 * s.s_temporal + 0.15 * s.s_modalidade
                  + 0.10 * s.s_quantidade + 0.10 * s.s_outlier) DESC
      ) AS rn_orgao
    FROM scored s
  )
  SELECT
    r.origem,
    r.ref_id,
    r.descricao,
    r.orgao_nome,
    r.modalidade,
    r.data_referencia,
    r.quantidade,
    r.unidade_medida,
    r.valor_unitario,
    r.fornecedor_nome,
    r.link_fonte,
    ROUND(r.score_final, 3)::NUMERIC,
    ROUND(r.s_sim::NUMERIC, 3),
    ROUND(r.s_temporal::NUMERIC, 3),
    ROUND(r.s_modalidade::NUMERIC, 3),
    ROUND(r.s_quantidade::NUMERIC, 3),
    ROUND(r.s_outlier::NUMERIC, 3),
    CONCAT_WS(' · ',
      CASE WHEN r.origem = 'painel_oficial' THEN 'Fonte oficial TCU 1.875' ELSE 'PNCP' END,
      ROUND(100 * r.s_sim)::TEXT || '% similaridade',
      CASE
        WHEN CURRENT_DATE - r.data_referencia <= 180 THEN 'últimos 6 meses'
        WHEN CURRENT_DATE - r.data_referencia <= 365 THEN 'últimos 12 meses'
        WHEN CURRENT_DATE - r.data_referencia <= 730 THEN 'últimos 24 meses'
        ELSE 'maior que 24 meses'
      END,
      CASE WHEN r.s_outlier = 0 THEN 'ATENÇÃO: fora do IQR' ELSE NULL END
    )
  FROM ranked r
  WHERE r.rn_orgao = 1
  ORDER BY r.score_final DESC
  LIMIT p_max_fontes;
$$;

GRANT EXECUTE ON FUNCTION public.montar_cesta_ia(TEXT, NUMERIC, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.montar_cesta_ia(TEXT, NUMERIC, TEXT, INTEGER, INTEGER, INTEGER) IS
  'Monta cesta de preços por scoring multifator (similaridade + temporal + modalidade + quantidade + outlier). Deduplica 1-por-órgão. Retorna top N com breakdown pra UI justificar cada escolha.';

-- ─── Tabela + RPC pra narrativa editável da cesta ────────────────────────
CREATE TABLE IF NOT EXISTS licitagov.cesta_narrativa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id UUID NOT NULL REFERENCES licitagov.processos(id) ON DELETE CASCADE,
  item_descricao TEXT NOT NULL,
  narrativa TEXT NOT NULL,
  editada_manualmente BOOLEAN NOT NULL DEFAULT FALSE,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(processo_id, item_descricao)
);
CREATE INDEX IF NOT EXISTS idx_cesta_narrativa_processo ON licitagov.cesta_narrativa(processo_id);
ALTER TABLE licitagov.cesta_narrativa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cesta_narrativa_select_own ON licitagov.cesta_narrativa;
CREATE POLICY cesta_narrativa_select_own ON licitagov.cesta_narrativa FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM licitagov.processos p
    WHERE p.id = cesta_narrativa.processo_id
      AND p.orgao_id = licitagov.current_orgao_id()
  )
);

DROP POLICY IF EXISTS cesta_narrativa_write_admin ON licitagov.cesta_narrativa;
CREATE POLICY cesta_narrativa_write_admin ON licitagov.cesta_narrativa FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM licitagov.processos p
    WHERE p.id = cesta_narrativa.processo_id
      AND p.orgao_id = licitagov.current_orgao_id()
  )
  AND licitagov.current_user_is_admin()
);

CREATE OR REPLACE FUNCTION public.set_cesta_narrativa(
  p_processo_id UUID,
  p_item_descricao TEXT,
  p_narrativa TEXT,
  p_editada_manualmente BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  INSERT INTO licitagov.cesta_narrativa (processo_id, item_descricao, narrativa, editada_manualmente)
  VALUES (p_processo_id, p_item_descricao, p_narrativa, p_editada_manualmente)
  ON CONFLICT (processo_id, item_descricao) DO UPDATE SET
    narrativa = EXCLUDED.narrativa,
    editada_manualmente = EXCLUDED.editada_manualmente OR licitagov.cesta_narrativa.editada_manualmente,
    atualizado_em = NOW();
$$;
GRANT EXECUTE ON FUNCTION public.set_cesta_narrativa(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cestas_narrativas(p_processo_id UUID)
RETURNS TABLE (item_descricao TEXT, narrativa TEXT, editada_manualmente BOOLEAN, atualizado_em TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT item_descricao, narrativa, editada_manualmente, atualizado_em
  FROM licitagov.cesta_narrativa
  WHERE processo_id = p_processo_id
  ORDER BY atualizado_em DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_cestas_narrativas(UUID) TO authenticated;
