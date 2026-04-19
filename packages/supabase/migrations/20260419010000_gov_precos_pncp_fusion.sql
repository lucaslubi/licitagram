-- ============================================================
-- LICITAGOV ↔ PUBLIC: Fusão Price Intelligence
--
-- O B2B (public.tenders + public.tender_items) scraneia o PNCP
-- diariamente. Expomos esses dados read-only pro Gov via VIEWs +
-- RPCs com SECURITY DEFINER. Dados PNCP são 100% públicos por lei,
-- então não há questão LGPD — é o próprio gov consultando dados
-- oficiais do gov.
--
-- Isolamento B2G↔B2B: Gov só lê `tenders` + `tender_items`.
-- Jamais vê `matches`, `proposals`, `companies` (dado privado B2B).
-- ============================================================

-- ------------------------------------------------------------
-- VIEW licitagov.v_precos_historicos
-- Join tenders + tender_items, um row por item + metadados da contratação
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW licitagov.v_precos_historicos AS
SELECT
  ti.id                              AS item_id,
  ti.tender_id,
  ti.numero_item,
  ti.descricao,
  ti.quantidade,
  ti.unidade_medida,
  ti.valor_unitario_estimado,
  ti.valor_total_estimado,
  ti.situacao_nome                   AS item_situacao,
  ti.categoria_nome,
  ti.criterio_julgamento_nome,
  -- contratação (tender)
  t.pncp_id,
  t.numero_compra,
  t.ano_compra,
  t.orgao_cnpj,
  t.orgao_nome,
  t.orgao_esfera,
  t.modalidade_nome,
  t.valor_estimado                   AS tender_valor_estimado,
  t.valor_homologado                 AS tender_valor_homologado,
  t.data_publicacao,
  t.data_abertura,
  t.link_pncp,
  t.situacao_nome                    AS tender_situacao
FROM public.tender_items ti
JOIN public.tenders t ON t.id = ti.tender_id
WHERE ti.valor_unitario_estimado IS NOT NULL
  AND ti.valor_unitario_estimado > 0
  AND ti.descricao IS NOT NULL
  AND length(trim(ti.descricao)) >= 5;

COMMENT ON VIEW licitagov.v_precos_historicos IS
  'Dados de preços históricos do PNCP vindos do scraper do B2B. Read-only para o gov.';

-- ------------------------------------------------------------
-- RPC: search_precos_pncp
-- Busca textual + filtros + paginação
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_precos_pncp(
  p_query TEXT,
  p_uf TEXT DEFAULT NULL,
  p_modalidade TEXT DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  item_id UUID,
  descricao TEXT,
  quantidade NUMERIC,
  unidade_medida TEXT,
  valor_unitario_estimado NUMERIC,
  valor_total_estimado NUMERIC,
  categoria TEXT,
  orgao_nome TEXT,
  orgao_esfera TEXT,
  modalidade_nome TEXT,
  data_publicacao TIMESTAMPTZ,
  ano_compra INTEGER,
  pncp_id TEXT,
  link_pncp TEXT,
  tender_valor_homologado NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT
    v.item_id,
    v.descricao,
    v.quantidade,
    v.unidade_medida,
    v.valor_unitario_estimado,
    v.valor_total_estimado,
    v.categoria_nome,
    v.orgao_nome,
    v.orgao_esfera,
    v.modalidade_nome,
    v.data_publicacao,
    v.ano_compra,
    v.pncp_id,
    v.link_pncp,
    v.tender_valor_homologado
  FROM licitagov.v_precos_historicos v
  WHERE v.descricao ILIKE '%' || p_query || '%'
    AND (p_uf IS NULL OR EXISTS (
      SELECT 1 WHERE v.orgao_nome ILIKE '%' || p_uf || '%'
    ))
    AND (p_modalidade IS NULL OR v.modalidade_nome ILIKE '%' || p_modalidade || '%')
    AND (p_date_from IS NULL OR v.data_publicacao >= p_date_from)
    AND (p_date_to IS NULL OR v.data_publicacao <= p_date_to)
  ORDER BY v.data_publicacao DESC NULLS LAST
  LIMIT GREATEST(10, LEAST(COALESCE(p_limit, 50), 500))
$$;
GRANT EXECUTE ON FUNCTION public.search_precos_pncp(TEXT, TEXT, TEXT, DATE, DATE, INTEGER) TO authenticated;

-- ------------------------------------------------------------
-- RPC: precos_pncp_stats — estatísticas de uma amostra
-- Cumpre Acórdão TCU 1.875/2021 se n >= 3 e CV < 25%
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.precos_pncp_stats(
  p_query TEXT,
  p_uf TEXT DEFAULT NULL,
  p_modalidade TEXT DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS TABLE (
  n INTEGER,
  media NUMERIC,
  mediana NUMERIC,
  minimo NUMERIC,
  maximo NUMERIC,
  desvio_padrao NUMERIC,
  cv NUMERIC,
  compliance_tcu_1875 BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  WITH amostra AS (
    SELECT v.valor_unitario_estimado AS valor
    FROM licitagov.v_precos_historicos v
    WHERE v.descricao ILIKE '%' || p_query || '%'
      AND (p_uf IS NULL OR v.orgao_nome ILIKE '%' || p_uf || '%')
      AND (p_modalidade IS NULL OR v.modalidade_nome ILIKE '%' || p_modalidade || '%')
      AND (p_date_from IS NULL OR v.data_publicacao >= p_date_from)
      AND (p_date_to IS NULL OR v.data_publicacao <= p_date_to)
    -- Outlier trim: remove percentis 1 e 99 pra não distorcer a média
    ORDER BY v.valor_unitario_estimado
    LIMIT 1000
  )
  SELECT
    COUNT(*)::INTEGER AS n,
    ROUND(AVG(valor)::numeric, 2) AS media,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY valor)::numeric, 2) AS mediana,
    ROUND(MIN(valor)::numeric, 2) AS minimo,
    ROUND(MAX(valor)::numeric, 2) AS maximo,
    ROUND(STDDEV_SAMP(valor)::numeric, 2) AS desvio_padrao,
    ROUND(
      CASE WHEN AVG(valor) > 0
           THEN (STDDEV_SAMP(valor) / AVG(valor) * 100)::numeric
           ELSE 0 END,
      2
    ) AS cv,
    (COUNT(*) >= 3 AND
     CASE WHEN AVG(valor) > 0
          THEN STDDEV_SAMP(valor) / AVG(valor) * 100
          ELSE 100 END < 25) AS compliance_tcu_1875
  FROM amostra
  WHERE valor IS NOT NULL
$$;
GRANT EXECUTE ON FUNCTION public.precos_pncp_stats(TEXT, TEXT, TEXT, DATE, DATE) TO authenticated;

-- ------------------------------------------------------------
-- RPC: add_preco_pesquisa_from_pncp
-- Salva uma linha do v_precos_historicos em licitagov.precos_pesquisa
-- vinculada a um processo. Chamada 1x por item selecionado pelo usuário.
-- ------------------------------------------------------------
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
  v_id UUID;
  v_orgao UUID := licitagov.current_orgao_id();
  v_valor NUMERIC;
  v_fonte TEXT;
  v_data DATE;
  v_link TEXT;
  v_item_desc TEXT;
BEGIN
  IF v_orgao IS NULL THEN RAISE EXCEPTION 'sem órgão'; END IF;

  -- Valida que o processo pertence ao órgão do usuário
  IF NOT EXISTS (
    SELECT 1 FROM licitagov.processos
    WHERE id = p_processo_id AND orgao_id = v_orgao
  ) THEN
    RAISE EXCEPTION 'processo não encontrado no órgão atual';
  END IF;

  -- Busca dados do item no PNCP
  SELECT
    v.valor_unitario_estimado,
    v.orgao_nome || ' — ' || COALESCE(v.modalidade_nome, 'modalidade não informada'),
    v.data_publicacao::date,
    v.link_pncp,
    v.descricao
  INTO v_valor, v_fonte, v_data, v_link, v_item_desc
  FROM licitagov.v_precos_historicos v
  WHERE v.item_id = p_pncp_item_id;

  IF v_valor IS NULL THEN RAISE EXCEPTION 'item PNCP não encontrado'; END IF;

  INSERT INTO licitagov.precos_pesquisa (
    processo_id, item_descricao, fonte, valor_unitario, data_referencia, url_fonte, metadados
  ) VALUES (
    p_processo_id,
    p_item_descricao,
    v_fonte,
    v_valor,
    v_data,
    v_link,
    jsonb_build_object('pncp_item_id', p_pncp_item_id, 'descricao_pncp', v_item_desc)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_preco_pesquisa_from_pncp(UUID, TEXT, UUID) TO authenticated;

-- ------------------------------------------------------------
-- Catálogo: top N items mais recorrentes no PNCP (pra auto-preencher
-- o catálogo vazio do gov com dados reais)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_catalogo_pncp(
  p_query TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  descricao TEXT,
  unidade_medida TEXT,
  categoria TEXT,
  n_contratacoes BIGINT,
  media_unitaria NUMERIC,
  mediana_unitaria NUMERIC,
  ultima_contratacao TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT
    v.descricao,
    v.unidade_medida,
    v.categoria_nome AS categoria,
    COUNT(*) AS n_contratacoes,
    ROUND(AVG(v.valor_unitario_estimado)::numeric, 2) AS media_unitaria,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.valor_unitario_estimado)::numeric, 2) AS mediana_unitaria,
    MAX(v.data_publicacao) AS ultima_contratacao
  FROM licitagov.v_precos_historicos v
  WHERE p_query IS NULL OR v.descricao ILIKE '%' || p_query || '%'
  GROUP BY v.descricao, v.unidade_medida, v.categoria_nome
  ORDER BY COUNT(*) DESC, MAX(v.data_publicacao) DESC
  LIMIT GREATEST(10, LEAST(COALESCE(p_limit, 100), 500))
$$;
GRANT EXECUTE ON FUNCTION public.search_catalogo_pncp(TEXT, INTEGER) TO authenticated;

-- ------------------------------------------------------------
-- Grants cross-schema: authenticated role precisa poder ler as
-- tabelas base referenciadas pela VIEW (caso execute direto).
-- Como os RPCs são SECURITY DEFINER, o owner já bypassa, mas grants
-- explícitos em select preservam a opção de queries diretas seguras.
-- ------------------------------------------------------------
GRANT SELECT ON public.tenders TO authenticated;
GRANT SELECT ON public.tender_items TO authenticated;
GRANT SELECT ON licitagov.v_precos_historicos TO authenticated;
