-- ============================================================
-- FIX: RPCs add_preco_pesquisa_from_pncp + add_preco_pesquisa_from_painel
--
-- Bugs detectados 2026-04-20:
--   1. Ambas RPCs escreviam em coluna `url_fonte` que NÃO existe na tabela
--      licitagov.precos_pesquisa. A coluna correta é `link_fonte`.
--   2. add_preco_pesquisa_from_pncp preenchia `fonte` com string livre
--      que violaria o CHECK constraint.
--
-- Nota: usa RECORD em vez de múltiplas variáveis v_* pra evitar
-- conflito de parser entre alias `v` da view e prefix de variáveis.
-- ============================================================

-- ─── add_preco_pesquisa_from_pncp (rewrite com RECORD) ────────────────────
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
  hist RECORD;
BEGIN
  IF orgao_atual IS NULL THEN RAISE EXCEPTION 'sem órgão'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM licitagov.processos
    WHERE id = p_processo_id AND orgao_id = orgao_atual
  ) THEN
    RAISE EXCEPTION 'processo não encontrado no órgão atual';
  END IF;

  SELECT
    valor_unitario_estimado,
    orgao_nome,
    modalidade_nome,
    data_publicacao::date AS data_ref,
    link_pncp,
    descricao
  INTO hist
  FROM licitagov.v_precos_historicos
  WHERE item_id = p_pncp_item_id;

  IF hist.valor_unitario_estimado IS NULL THEN
    RAISE EXCEPTION 'item PNCP não encontrado';
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
  ) VALUES (
    p_processo_id,
    p_item_descricao,
    'contratacoes_similares',
    hist.valor_unitario_estimado,
    hist.data_ref,
    hist.link_pncp,
    hist.orgao_nome,
    jsonb_build_object(
      'pncp_item_id', p_pncp_item_id,
      'descricao_pncp', hist.descricao,
      'orgao_nome', hist.orgao_nome,
      'modalidade', hist.modalidade_nome,
      'origem', 'pncp_v_precos_historicos'
    )
  )
  RETURNING id INTO novo_id;

  RETURN novo_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_preco_pesquisa_from_pncp(UUID, TEXT, UUID) TO authenticated;

-- ─── add_preco_pesquisa_from_painel (rewrite com RECORD) ──────────────────
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
  painel RECORD;
BEGIN
  IF orgao_atual IS NULL THEN RAISE EXCEPTION 'sem órgão'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM licitagov.processos
    WHERE id = p_processo_id AND orgao_id = orgao_atual
  ) THEN
    RAISE EXCEPTION 'processo não encontrado no órgão atual';
  END IF;

  SELECT
    valor_unitario,
    orgao_nome,
    uasg_nome,
    data_homologacao,
    fonte_url,
    descricao,
    fornecedor_nome,
    fornecedor_cnpj,
    modalidade
  INTO painel
  FROM licitagov.painel_precos_oficial
  WHERE id = p_painel_id;

  IF painel.valor_unitario IS NULL THEN
    RAISE EXCEPTION 'preço não encontrado no Painel Oficial';
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
  ) VALUES (
    p_processo_id,
    p_item_descricao,
    'painel_precos',
    painel.valor_unitario,
    painel.data_homologacao,
    painel.fonte_url,
    painel.fornecedor_cnpj,
    painel.fornecedor_nome,
    jsonb_build_object(
      'painel_id', p_painel_id,
      'descricao_painel', painel.descricao,
      'orgao_nome', painel.orgao_nome,
      'uasg_nome', painel.uasg_nome,
      'modalidade', painel.modalidade,
      'origem', 'painel_oficial_compras_gov'
    )
  )
  RETURNING id INTO novo_id;

  RETURN novo_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_preco_pesquisa_from_painel(UUID, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION public.add_preco_pesquisa_from_pncp(UUID, TEXT, UUID)
  IS 'Fix 2026-04-20: link_fonte (era url_fonte) + fonte=contratacoes_similares + RECORD (evita parser conflict)';
COMMENT ON FUNCTION public.add_preco_pesquisa_from_painel(UUID, TEXT, UUID)
  IS 'Fix 2026-04-20: link_fonte (era url_fonte) + fonte=painel_precos + RECORD (evita parser conflict)';
