-- ============================================================
-- LICITAGOV: Phase 6 (Pesquisa de Preços — cesta TCU)
-- ============================================================
-- RPCs pra alimentar a cesta de preços via v_historico_pncp e calcular
-- estatísticas (média, mediana, desvio-padrão). Segue diretrizes do
-- Acórdão 1.875/2021-TCU e IN 65/2021.
-- ============================================================

-- ------------------------------------------------------------
-- RPC: search_historico_precos
-- Busca referências de preço no histórico PNCP para um objeto livre
-- do processo. Usa ILIKE simples (fuzzy real entra na Fase 7 com
-- pgvector). Limitado ao próprio órgão por padrão; com
-- p_todos_orgaos = TRUE, busca em todo o PNCP (base pública federada).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_historico_precos(
  p_processo_id UUID,
  p_keywords TEXT,
  p_todos_orgaos BOOLEAN DEFAULT TRUE,
  p_limit INTEGER DEFAULT 30
)
RETURNS TABLE (
  tender_id UUID,
  orgao_cnpj TEXT,
  orgao_nome TEXT,
  modalidade_nome TEXT,
  objeto TEXT,
  valor_estimado NUMERIC,
  valor_homologado NUMERIC,
  data_publicacao TIMESTAMPTZ,
  uf CHAR(2),
  municipio TEXT,
  similaridade_score INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
DECLARE
  v_orgao_id UUID := licitagov.current_orgao_id();
  v_orgao_cnpj VARCHAR(14);
  v_query TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM licitagov.processos WHERE id = p_processo_id AND orgao_id = v_orgao_id) THEN
    RAISE EXCEPTION 'processo não pertence ao órgão';
  END IF;

  -- Busca CNPJ do órgão caso o usuário queira só do próprio
  SELECT o.cnpj INTO v_orgao_cnpj FROM licitagov.orgaos o WHERE o.id = v_orgao_id LIMIT 1;

  -- Normaliza keywords: divide por espaço, cada token vira ILIKE parcial
  v_query := '%' || regexp_replace(trim(lower(p_keywords)), '\s+', '%', 'g') || '%';

  RETURN QUERY
    SELECT
      h.tender_id,
      h.orgao_cnpj::TEXT,
      h.orgao_nome,
      h.modalidade_nome,
      h.objeto,
      h.valor_estimado,
      h.valor_homologado,
      h.data_publicacao,
      h.uf,
      h.municipio,
      -- Score simples: mais keywords encontradas = score maior
      (
        CASE WHEN lower(h.objeto) LIKE v_query THEN 10 ELSE 0 END +
        CASE WHEN h.valor_homologado IS NOT NULL THEN 5 ELSE 0 END +
        CASE WHEN h.orgao_cnpj = v_orgao_cnpj THEN 3 ELSE 0 END
      )::INTEGER AS similaridade_score
    FROM licitagov.v_historico_pncp h
    WHERE lower(h.objeto) LIKE v_query
      AND (p_todos_orgaos OR h.orgao_cnpj = v_orgao_cnpj)
      AND (h.valor_homologado IS NOT NULL OR h.valor_estimado IS NOT NULL)
    ORDER BY similaridade_score DESC, h.data_publicacao DESC NULLS LAST
    LIMIT LEAST(p_limit, 100);
END;
$$;
GRANT EXECUTE ON FUNCTION public.search_historico_precos(UUID, TEXT, BOOLEAN, INTEGER) TO authenticated;

-- ------------------------------------------------------------
-- RPC: save_cesta_precos — persiste os preços selecionados + recalcula estatísticas
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_cesta_precos(
  p_processo_id UUID,
  p_item_descricao TEXT,
  p_fontes JSONB,  -- [{ fonte, valor_unitario, data_referencia, fornecedor_nome, link_fonte, outlier }]
  p_metodo VARCHAR(20) DEFAULT 'mediana'  -- 'media' | 'mediana' | 'menor'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
DECLARE
  v_orgao_id UUID := licitagov.current_orgao_id();
  v_count INTEGER := 0;
  v_fonte JSONB;
  v_media NUMERIC;
  v_mediana NUMERIC;
  v_menor NUMERIC;
  v_maior NUMERIC;
  v_desvio NUMERIC;
  v_cv NUMERIC;
  v_valor_final NUMERIC;
BEGIN
  IF NOT licitagov.current_user_is_admin() THEN
    RAISE EXCEPTION 'apenas admin/coordenador';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM licitagov.processos WHERE id = p_processo_id AND orgao_id = v_orgao_id) THEN
    RAISE EXCEPTION 'processo não pertence ao órgão';
  END IF;

  -- Limpa pesquisa anterior desse item no processo
  DELETE FROM licitagov.precos_pesquisa
  WHERE processo_id = p_processo_id AND item_descricao = p_item_descricao;

  FOR v_fonte IN SELECT * FROM jsonb_array_elements(p_fontes) LOOP
    INSERT INTO licitagov.precos_pesquisa (
      processo_id, item_descricao, fonte, fonte_prioridade, valor_unitario,
      data_referencia, fornecedor_cnpj, fornecedor_nome, link_fonte, outlier,
      considerado_no_calculo
    )
    VALUES (
      p_processo_id,
      p_item_descricao,
      NULLIF(v_fonte->>'fonte', ''),
      NULLIF(v_fonte->>'fonte_prioridade', '')::INTEGER,
      (v_fonte->>'valor_unitario')::NUMERIC,
      NULLIF(v_fonte->>'data_referencia', '')::DATE,
      NULLIF(v_fonte->>'fornecedor_cnpj', ''),
      NULLIF(v_fonte->>'fornecedor_nome', ''),
      NULLIF(v_fonte->>'link_fonte', ''),
      COALESCE((v_fonte->>'outlier')::BOOLEAN, FALSE),
      COALESCE((v_fonte->>'considerado_no_calculo')::BOOLEAN, TRUE)
    );
    v_count := v_count + 1;
  END LOOP;

  -- Calcula estatísticas (somente sobre os considerados e não-outliers)
  SELECT
    AVG(valor_unitario),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY valor_unitario),
    MIN(valor_unitario),
    MAX(valor_unitario),
    STDDEV_POP(valor_unitario)
  INTO v_media, v_mediana, v_menor, v_maior, v_desvio
  FROM licitagov.precos_pesquisa
  WHERE processo_id = p_processo_id
    AND item_descricao = p_item_descricao
    AND considerado_no_calculo = TRUE
    AND outlier = FALSE;

  v_cv := CASE WHEN v_media > 0 AND v_desvio IS NOT NULL THEN (v_desvio / v_media) * 100 ELSE NULL END;

  v_valor_final := CASE
    WHEN p_metodo = 'media' THEN v_media
    WHEN p_metodo = 'menor' THEN v_menor
    ELSE v_mediana
  END;

  -- Upsert estimativa
  DELETE FROM licitagov.precos_estimativa
  WHERE processo_id = p_processo_id AND item_descricao = p_item_descricao;

  INSERT INTO licitagov.precos_estimativa (
    processo_id, item_descricao, qtd_amostras, media, mediana, menor_valor, maior_valor,
    desvio_padrao, coeficiente_variacao, metodo_escolhido, valor_final
  )
  VALUES (
    p_processo_id, p_item_descricao, v_count, v_media, v_mediana, v_menor, v_maior,
    v_desvio, v_cv, p_metodo, COALESCE(v_valor_final, 0)
  );

  RETURN jsonb_build_object(
    'count', v_count,
    'media', v_media,
    'mediana', v_mediana,
    'menor', v_menor,
    'maior', v_maior,
    'desvio_padrao', v_desvio,
    'coeficiente_variacao', v_cv,
    'metodo', p_metodo,
    'valor_final', v_valor_final
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_cesta_precos(UUID, TEXT, JSONB, VARCHAR(20)) TO authenticated;

-- ------------------------------------------------------------
-- RPC: get_precos_estimativa
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_precos_estimativa(p_processo_id UUID)
RETURNS TABLE (
  item_descricao TEXT,
  qtd_amostras INTEGER,
  media NUMERIC,
  mediana NUMERIC,
  menor_valor NUMERIC,
  maior_valor NUMERIC,
  desvio_padrao NUMERIC,
  coeficiente_variacao NUMERIC,
  metodo_escolhido VARCHAR(20),
  valor_final NUMERIC,
  calculado_em TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT
    e.item_descricao, e.qtd_amostras, e.media, e.mediana, e.menor_valor, e.maior_valor,
    e.desvio_padrao, e.coeficiente_variacao, e.metodo_escolhido, e.valor_final, e.calculado_em
  FROM licitagov.precos_estimativa e
  WHERE e.processo_id = p_processo_id
    AND e.processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id())
  ORDER BY e.calculado_em DESC
$$;
GRANT EXECUTE ON FUNCTION public.get_precos_estimativa(UUID) TO authenticated;

COMMENT ON FUNCTION public.search_historico_precos IS
  'Fase 6 — busca fontes de preço no histórico PNCP (cesta de preços TCU).';
COMMENT ON FUNCTION public.save_cesta_precos IS
  'Persiste cesta + calcula estatísticas (média/mediana/desvio/CV) e valor final por método.';
