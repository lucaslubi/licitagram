-- ============================================================
-- FIX: Links PNCP 404 na cesta de preços
--
-- Bug: a view v_precos_historicos expõe `t.link_pncp` direto, mas o
-- scraper do B2B nem sempre preenche esse campo (só o `pncp_id` é
-- garantido). Resultado: user clica no link e vai pra URL vazia ou 404.
--
-- Padrão correto (adotado no B2B + workers Telegram):
--   https://pncp.gov.br/app/editais/{pncp_id com '/' no lugar de '-'}
--
-- Fix: substitui montar_cesta_ia pra construir o link corretamente
-- usando COALESCE(link_pncp, pattern-com-pncp-id).
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
  origem TEXT, ref_id UUID, descricao TEXT, orgao_nome TEXT, modalidade TEXT,
  data_referencia DATE, quantidade NUMERIC, unidade_medida TEXT,
  valor_unitario NUMERIC, fornecedor_nome TEXT, link_fonte TEXT,
  score NUMERIC, score_similaridade NUMERIC, score_temporal NUMERIC,
  score_modalidade NUMERIC, score_quantidade NUMERIC, score_outlier NUMERIC,
  justificativa TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  WITH candidatos AS (
    SELECT
      'pncp'::TEXT AS origem, h.item_id AS ref_id, h.descricao,
      h.orgao_nome, h.modalidade_nome AS modalidade,
      h.data_publicacao::date AS data_referencia, h.quantidade,
      h.unidade_medida, h.valor_unitario_estimado AS valor_unitario,
      NULL::TEXT AS fornecedor_nome,
      -- Link PNCP correto: usa link_pncp se existe, senão constrói a partir do pncp_id
      -- Padrão: https://pncp.gov.br/app/editais/{pncp_id com '/' no lugar de '-'}
      COALESCE(
        NULLIF(h.link_pncp, ''),
        CASE
          WHEN h.pncp_id IS NOT NULL AND h.pncp_id <> ''
          THEN 'https://pncp.gov.br/app/editais/' || REPLACE(h.pncp_id, '-', '/')
          ELSE NULL
        END
      ) AS link_fonte,
      similarity(h.descricao, p_query) AS sim_desc
    FROM licitagov.v_precos_historicos h
    WHERE h.data_publicacao >= (CURRENT_DATE - (p_meses_back || ' months')::INTERVAL)
      AND similarity(h.descricao, p_query) > 0.18
      AND h.valor_unitario_estimado > 0
    UNION ALL
    SELECT
      'painel_oficial'::TEXT, pp.id, pp.descricao,
      COALESCE(pp.orgao_nome, pp.uasg_nome), pp.modalidade,
      pp.data_homologacao, pp.quantidade, pp.unidade_medida, pp.valor_unitario,
      pp.fornecedor_nome, pp.fonte_url,
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
    SELECT c.*, c.sim_desc AS s_sim,
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
    FROM candidatos c CROSS JOIN iqr_bounds b
  ),
  ranked AS (
    SELECT s.*,
      (0.40*s.s_sim + 0.25*s.s_temporal + 0.15*s.s_modalidade
       + 0.10*s.s_quantidade + 0.10*s.s_outlier)::NUMERIC AS score_final,
      ROW_NUMBER() OVER (
        PARTITION BY s.origem, s.orgao_nome
        ORDER BY (0.40*s.s_sim + 0.25*s.s_temporal + 0.15*s.s_modalidade
                  + 0.10*s.s_quantidade + 0.10*s.s_outlier) DESC
      ) AS rn_orgao
    FROM scored s
  )
  SELECT
    r.origem, r.ref_id, r.descricao, r.orgao_nome, r.modalidade,
    r.data_referencia, r.quantidade, r.unidade_medida, r.valor_unitario,
    r.fornecedor_nome, r.link_fonte,
    ROUND(r.score_final, 3)::NUMERIC,
    ROUND(r.s_sim::NUMERIC, 3), ROUND(r.s_temporal::NUMERIC, 3),
    ROUND(r.s_modalidade::NUMERIC, 3), ROUND(r.s_quantidade::NUMERIC, 3),
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

-- Idem pra `add_preco_pesquisa_from_pncp` — se o link_pncp original for
-- null, constrói a URL correta a partir do pncp_id.
CREATE OR REPLACE FUNCTION public.add_preco_pesquisa_from_pncp(
  p_processo_id UUID,
  p_item_descricao TEXT,
  p_pncp_item_id UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
DECLARE
  novo_id UUID;
  orgao_atual UUID := licitagov.current_orgao_id();
BEGIN
  IF orgao_atual IS NULL THEN RAISE EXCEPTION 'sem órgão'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM licitagov.processos
    WHERE id = p_processo_id AND orgao_id = orgao_atual
  ) THEN
    RAISE EXCEPTION 'processo não encontrado no órgão atual';
  END IF;

  INSERT INTO licitagov.precos_pesquisa (
    processo_id,
    item_descricao,
    fonte,
    valor_unitario,
    data_referencia,
    link_fonte,
    fornecedor_nome,
    metadados
  )
  SELECT
    p_processo_id,
    p_item_descricao,
    'contratacoes_similares',
    h.valor_unitario_estimado,
    h.data_publicacao::date,
    -- Link PNCP resolvido: usa link_pncp se existir, senão constrói do pncp_id
    COALESCE(
      NULLIF(h.link_pncp, ''),
      CASE
        WHEN h.pncp_id IS NOT NULL AND h.pncp_id <> ''
        THEN 'https://pncp.gov.br/app/editais/' || REPLACE(h.pncp_id, '-', '/')
        ELSE NULL
      END
    ),
    h.orgao_nome,
    jsonb_build_object(
      'pncp_item_id', p_pncp_item_id,
      'descricao_pncp', h.descricao,
      'orgao_nome', h.orgao_nome,
      'modalidade', h.modalidade_nome,
      'pncp_id', h.pncp_id,
      'origem', 'pncp_v_precos_historicos'
    )
  FROM licitagov.v_precos_historicos h
  WHERE h.item_id = p_pncp_item_id
  RETURNING id INTO novo_id;

  IF novo_id IS NULL THEN
    RAISE EXCEPTION 'item PNCP não encontrado';
  END IF;

  RETURN novo_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_preco_pesquisa_from_pncp(UUID, TEXT, UUID) TO authenticated;
