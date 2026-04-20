-- ============================================================
-- FIX: RPCs add_preco_pesquisa_from_pncp + add_preco_pesquisa_from_painel
--
-- Bugs detectados 2026-04-20:
--   1. Ambas RPCs escreviam em coluna `url_fonte` que NÃO existe
--   2. add_preco_pesquisa_from_pncp violava CHECK constraint em `fonte`
--
-- Estratégia: INSERT ... SELECT direto (sem SELECT INTO variable)
-- pra evitar parser conflicts no SQL editor do Supabase.
-- ============================================================

-- ─── add_preco_pesquisa_from_pncp ─────────────────────────────────────────
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
    h.link_pncp,
    h.orgao_nome,
    jsonb_build_object(
      'pncp_item_id', p_pncp_item_id,
      'descricao_pncp', h.descricao,
      'orgao_nome', h.orgao_nome,
      'modalidade', h.modalidade_nome,
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


-- ─── add_preco_pesquisa_from_painel ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_preco_pesquisa_from_painel(
  p_processo_id UUID,
  p_item_descricao TEXT,
  p_painel_id UUID
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
    fornecedor_cnpj,
    fornecedor_nome,
    metadados
  )
  SELECT
    p_processo_id,
    p_item_descricao,
    'painel_precos',
    pp.valor_unitario,
    pp.data_homologacao,
    pp.fonte_url,
    pp.fornecedor_cnpj,
    pp.fornecedor_nome,
    jsonb_build_object(
      'painel_id', p_painel_id,
      'descricao_painel', pp.descricao,
      'orgao_nome', pp.orgao_nome,
      'uasg_nome', pp.uasg_nome,
      'modalidade', pp.modalidade,
      'origem', 'painel_oficial_compras_gov'
    )
  FROM licitagov.painel_precos_oficial pp
  WHERE pp.id = p_painel_id
  RETURNING id INTO novo_id;

  IF novo_id IS NULL THEN
    RAISE EXCEPTION 'preço não encontrado no Painel Oficial';
  END IF;

  RETURN novo_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_preco_pesquisa_from_painel(UUID, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION public.add_preco_pesquisa_from_pncp(UUID, TEXT, UUID)
  IS 'Fix 2026-04-20: INSERT ... SELECT direto (sem SELECT INTO variable)';
COMMENT ON FUNCTION public.add_preco_pesquisa_from_painel(UUID, TEXT, UUID)
  IS 'Fix 2026-04-20: INSERT ... SELECT direto (sem SELECT INTO variable)';
