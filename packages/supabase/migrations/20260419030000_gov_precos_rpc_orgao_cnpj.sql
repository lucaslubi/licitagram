-- ============================================================
-- LICITAGOV: search_precos_pncp — adiciona orgao_cnpj e orgao_esfera
-- ao retorno (já existiam na VIEW mas não expostos no RPC).
-- ============================================================

DROP FUNCTION IF EXISTS public.search_precos_pncp(TEXT, TEXT, TEXT, DATE, DATE, INTEGER);

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
  orgao_cnpj TEXT,
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
AS $function$
  SELECT
    v.item_id,
    v.descricao,
    v.quantidade,
    v.unidade_medida,
    v.valor_unitario_estimado,
    v.valor_total_estimado,
    v.categoria_nome,
    v.orgao_cnpj,
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
    AND (p_uf IS NULL OR v.orgao_nome ILIKE '%' || p_uf || '%')
    AND (p_modalidade IS NULL OR v.modalidade_nome ILIKE '%' || p_modalidade || '%')
    AND (p_date_from IS NULL OR v.data_publicacao >= p_date_from)
    AND (p_date_to IS NULL OR v.data_publicacao <= p_date_to)
  ORDER BY v.data_publicacao DESC NULLS LAST
  LIMIT GREATEST(10, LEAST(COALESCE(p_limit, 50), 500))
$function$;

GRANT EXECUTE ON FUNCTION public.search_precos_pncp(TEXT, TEXT, TEXT, DATE, DATE, INTEGER) TO authenticated;
