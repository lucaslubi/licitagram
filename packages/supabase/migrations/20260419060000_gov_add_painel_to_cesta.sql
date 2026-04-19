-- ============================================================
-- LICITAGOV: add_preco_pesquisa_from_painel — adiciona preço do
-- Painel de Preços Oficial na cesta de pesquisa do processo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.add_preco_pesquisa_from_painel(
  p_processo_id UUID,
  p_item_descricao TEXT,
  p_painel_id UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $function$
DECLARE
  v_id UUID;
  v_orgao UUID := licitagov.current_orgao_id();
  v_valor NUMERIC;
  v_fonte TEXT;
  v_data DATE;
  v_fonte_url TEXT;
  v_desc TEXT;
  v_forn TEXT;
BEGIN
  IF v_orgao IS NULL THEN RAISE EXCEPTION 'sem órgão'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM licitagov.processos
    WHERE id = p_processo_id AND orgao_id = v_orgao
  ) THEN
    RAISE EXCEPTION 'processo não encontrado no órgão atual';
  END IF;

  SELECT
    p.valor_unitario,
    COALESCE(p.orgao_nome, p.uasg_nome) || ' — Painel de Preços Oficial',
    p.data_homologacao,
    p.fonte_url,
    p.descricao,
    p.fornecedor_nome
  INTO v_valor, v_fonte, v_data, v_fonte_url, v_desc, v_forn
  FROM licitagov.painel_precos_oficial p
  WHERE p.id = p_painel_id;

  IF v_valor IS NULL THEN RAISE EXCEPTION 'preço não encontrado no Painel Oficial'; END IF;

  INSERT INTO licitagov.precos_pesquisa (
    processo_id, item_descricao, fonte, valor_unitario, data_referencia, url_fonte, metadados
  ) VALUES (
    p_processo_id,
    p_item_descricao,
    v_fonte,
    v_valor,
    v_data,
    v_fonte_url,
    jsonb_build_object(
      'painel_id', p_painel_id,
      'descricao_painel', v_desc,
      'fornecedor', v_forn,
      'origem', 'painel_oficial_compras_gov'
    )
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.add_preco_pesquisa_from_painel(UUID, TEXT, UUID) TO authenticated;
