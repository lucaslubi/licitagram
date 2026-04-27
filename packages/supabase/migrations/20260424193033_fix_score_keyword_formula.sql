-- ============================================================
-- FIX: fórmula score_keyword nas RPCs de matching pgvector
--
-- Sintoma observado em prod:
--   - 12k rows com score_keyword=0.00, 17k em exatamente 0.50 (default fallback),
--     cauda esparsa, cap em 1.0 só ~125 rows.
--   - Empresas com keywords ricas eram PUNIDAS pela fórmula `count/total*3`
--     (denominador grande = score baixo, mesmo com vários hits).
--
-- Antes: LEAST(1.0, (count_matched / total_keywords) * 3)
-- Depois: LEAST(1.0, count_matched * 0.25)  -- 4 hits já maximiza, sem
--         penalizar quem cadastrou mais keywords.
--
-- Aplicado em ambas RPCs:
--   - public.match_companies_for_tender
--   - public.match_tenders_for_company
-- Apenas a expressão de s_keyword muda. Schema/colunas/tipos intactos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.match_companies_for_tender(
  p_tender_id UUID,
  p_limit INTEGER DEFAULT 200,
  p_min_score NUMERIC DEFAULT 0.40
) RETURNS TABLE (
  company_id UUID,
  score NUMERIC,
  score_semantic NUMERIC,
  score_cnae NUMERIC,
  score_keyword NUMERIC,
  score_valor NUMERIC,
  score_modalidade NUMERIC,
  score_uf NUMERIC,
  match_tier TEXT,
  reasons JSONB
)
LANGUAGE sql STABLE AS $$
  WITH tender AS (
    SELECT
      t.id, t.embedding, t.objeto, t.cnae_classificados,
      t.valor_estimado, t.uf, t.modalidade_nome
    FROM public.tenders t
    WHERE t.id = p_tender_id
      AND t.embedding IS NOT NULL
  ),
  candidatos AS (
    SELECT
      c.id,
      c.cnae_principal,
      c.cnaes_secundarios,
      c.descricao_servicos,
      c.capacidades,
      c.palavras_chave,
      c.uf AS company_uf,
      c.faturamento_anual,
      c.embedding,
      (1 - (c.embedding <=> t.embedding)) AS sim_semantic,
      t.objeto AS t_objeto,
      t.cnae_classificados AS t_cnae_class,
      t.embedding AS t_embedding,
      t.valor_estimado AS t_valor,
      t.uf AS t_uf
    FROM public.companies c
    CROSS JOIN tender t
    WHERE c.embedding IS NOT NULL
    ORDER BY c.embedding <=> t.embedding
    LIMIT 1000
  ),
  scored AS (
    SELECT
      cd.id AS company_id,
      cd.sim_semantic AS s_semantic,
      public.score_cnae_match(
        cd.cnae_principal, cd.cnaes_secundarios, cd.capacidades,
        cd.embedding, cd.t_cnae_class, cd.t_embedding
      ) AS s_cnae,
      CASE
        WHEN cd.palavras_chave IS NULL OR array_length(cd.palavras_chave, 1) IS NULL THEN 0.5
        ELSE LEAST(
          1.0,
          (SELECT COUNT(*)::NUMERIC FROM unnest(cd.palavras_chave) k
           WHERE LOWER(cd.t_objeto) LIKE '%' || LOWER(k) || '%'
          ) * 0.25
        )
      END AS s_keyword,
      CASE
        WHEN cd.t_valor IS NULL OR cd.faturamento_anual IS NULL THEN 0.5
        WHEN cd.t_valor <= cd.faturamento_anual * 0.5 THEN 1.0
        WHEN cd.t_valor <= cd.faturamento_anual * 2.0 THEN 0.8
        WHEN cd.t_valor <= cd.faturamento_anual * 5.0 THEN 0.5
        ELSE 0.2
      END AS s_valor,
      0.5::NUMERIC AS s_modalidade,
      CASE
        WHEN cd.company_uf IS NULL OR cd.t_uf IS NULL THEN 0.5
        WHEN cd.company_uf = cd.t_uf THEN 1.0
        ELSE 0.4
      END AS s_uf
    FROM candidatos cd
  ),
  ranked AS (
    SELECT
      s.company_id,
      s.s_semantic, s.s_cnae, s.s_keyword, s.s_valor, s.s_modalidade, s.s_uf,
      (0.40 * s.s_semantic + 0.20 * s.s_cnae + 0.15 * s.s_keyword
       + 0.10 * s.s_valor + 0.10 * s.s_modalidade + 0.05 * s.s_uf)::NUMERIC AS score_final
    FROM scored s
  )
  SELECT
    r.company_id,
    ROUND(r.score_final, 4),
    ROUND(r.s_semantic::NUMERIC, 4),
    ROUND(r.s_cnae::NUMERIC, 4),
    ROUND(r.s_keyword::NUMERIC, 4),
    ROUND(r.s_valor::NUMERIC, 4),
    ROUND(r.s_modalidade::NUMERIC, 4),
    ROUND(r.s_uf::NUMERIC, 4),
    CASE
      WHEN r.score_final >= 0.70 THEN 'auto_high'
      WHEN r.score_final >= 0.45 THEN 'borderline'
      ELSE 'auto_low'
    END,
    jsonb_build_object(
      'semantic', ROUND(r.s_semantic::NUMERIC, 4),
      'cnae', ROUND(r.s_cnae::NUMERIC, 4),
      'keyword', ROUND(r.s_keyword::NUMERIC, 4),
      'valor', ROUND(r.s_valor::NUMERIC, 4),
      'modalidade', ROUND(r.s_modalidade::NUMERIC, 4),
      'uf', ROUND(r.s_uf::NUMERIC, 4),
      'weights', '{"semantic":0.40,"cnae":0.20,"keyword":0.15,"valor":0.10,"modalidade":0.10,"uf":0.05}'::jsonb,
      'algorithm_version', 'v1.1'
    )
  FROM ranked r
  WHERE r.score_final >= p_min_score
  ORDER BY r.score_final DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.match_companies_for_tender(UUID, INTEGER, NUMERIC) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.match_tenders_for_company(
  p_company_id UUID,
  p_limit INTEGER DEFAULT 100,
  p_min_score NUMERIC DEFAULT 0.40,
  p_max_days_back INTEGER DEFAULT 60
) RETURNS TABLE (
  tender_id UUID,
  score NUMERIC,
  match_tier TEXT,
  reasons JSONB
)
LANGUAGE sql STABLE AS $$
  WITH company AS (
    SELECT
      c.id, c.embedding, c.cnae_principal, c.cnaes_secundarios,
      c.capacidades, c.palavras_chave, c.uf AS company_uf,
      c.faturamento_anual
    FROM public.companies c
    WHERE c.id = p_company_id AND c.embedding IS NOT NULL
  ),
  candidatos AS (
    SELECT
      t.id, t.embedding, t.objeto, t.cnae_classificados,
      t.valor_estimado, t.uf,
      (1 - (t.embedding <=> co.embedding)) AS sim_semantic,
      co.cnae_principal AS c_cnae_p,
      co.cnaes_secundarios AS c_cnae_s,
      co.capacidades AS c_capacidades,
      co.embedding AS c_embedding,
      co.palavras_chave AS c_palavras,
      co.company_uf AS c_uf,
      co.faturamento_anual AS c_fat
    FROM public.tenders t
    CROSS JOIN company co
    WHERE t.embedding IS NOT NULL
      AND t.data_publicacao >= (CURRENT_DATE - (p_max_days_back || ' days')::INTERVAL)
      AND t.status != 'error'
    ORDER BY t.embedding <=> co.embedding
    LIMIT 500
  ),
  scored AS (
    SELECT
      cd.id AS tender_id,
      cd.sim_semantic AS s_semantic,
      public.score_cnae_match(
        cd.c_cnae_p, cd.c_cnae_s, cd.c_capacidades,
        cd.c_embedding, cd.cnae_classificados, cd.embedding
      ) AS s_cnae,
      CASE
        WHEN cd.c_palavras IS NULL OR array_length(cd.c_palavras, 1) IS NULL THEN 0.5
        ELSE LEAST(
          1.0,
          (SELECT COUNT(*)::NUMERIC FROM unnest(cd.c_palavras) k
           WHERE LOWER(cd.objeto) LIKE '%' || LOWER(k) || '%'
          ) * 0.25
        )
      END AS s_keyword,
      CASE
        WHEN cd.valor_estimado IS NULL OR cd.c_fat IS NULL THEN 0.5
        WHEN cd.valor_estimado <= cd.c_fat * 0.5 THEN 1.0
        WHEN cd.valor_estimado <= cd.c_fat * 2.0 THEN 0.8
        WHEN cd.valor_estimado <= cd.c_fat * 5.0 THEN 0.5
        ELSE 0.2
      END AS s_valor,
      CASE
        WHEN cd.c_uf IS NULL OR cd.uf IS NULL THEN 0.5
        WHEN cd.c_uf = cd.uf THEN 1.0
        ELSE 0.4
      END AS s_uf
    FROM candidatos cd
  ),
  ranked AS (
    SELECT
      s.tender_id,
      (0.40 * s.s_semantic + 0.20 * s.s_cnae + 0.15 * s.s_keyword
       + 0.10 * s.s_valor + 0.10 * 0.5 + 0.05 * s.s_uf)::NUMERIC AS score_final,
      s.s_semantic, s.s_cnae, s.s_keyword, s.s_valor, s.s_uf
    FROM scored s
  )
  SELECT
    r.tender_id,
    ROUND(r.score_final, 4),
    CASE
      WHEN r.score_final >= 0.70 THEN 'auto_high'
      WHEN r.score_final >= 0.45 THEN 'borderline'
      ELSE 'auto_low'
    END,
    jsonb_build_object(
      'semantic', ROUND(r.s_semantic::NUMERIC, 4),
      'cnae', ROUND(r.s_cnae::NUMERIC, 4),
      'keyword', ROUND(r.s_keyword::NUMERIC, 4),
      'valor', ROUND(r.s_valor::NUMERIC, 4),
      'uf', ROUND(r.s_uf::NUMERIC, 4),
      'algorithm_version', 'v1.1'
    )
  FROM ranked r
  WHERE r.score_final >= p_min_score
  ORDER BY r.score_final DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.match_tenders_for_company(UUID, INTEGER, NUMERIC, INTEGER) TO authenticated, service_role;
