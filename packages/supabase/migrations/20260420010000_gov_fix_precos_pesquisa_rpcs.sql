-- ============================================================
-- FIX: RPCs add_preco_pesquisa_from_pncp + add_preco_pesquisa_from_painel
--
-- Bugs detectados 2026-04-20:
--   1. Ambas RPCs escreviam em coluna `url_fonte` que NÃO existe na tabela
--      licitagov.precos_pesquisa. A coluna correta é `link_fonte`.
--      Erro aparente ao usuário: "column url_fonte of relation
--      precos_pesquisa does not exist".
--   2. add_preco_pesquisa_from_pncp preenchia `fonte` com string livre
--      ("MUNICIPIO DE ARCOS — Credenciamento") que violaria o CHECK
--      constraint da tabela (fonte IN ('painel_precos', 'contratacoes_similares',
--      'midia_especializada', 'fornecedor_direto', 'nfe_base', 'sinapi', 'sicro')).
--      Fica oculto só porque o erro #1 acontece antes.
--
-- Fix: substitui ambas as functions usando `link_fonte` e valores corretos
-- de `fonte` (do whitelist). Info descritiva (nome do órgão, modalidade,
-- fornecedor) vai pro JSONB metadados.
-- ============================================================

-- ─── add_preco_pesquisa_from_pncp (rewrite) ───────────────────────────────
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
  v_orgao_nome TEXT;
  v_modalidade TEXT;
  v_data DATE;
  v_link TEXT;
  v_item_desc TEXT;
BEGIN
  IF v_orgao IS NULL THEN RAISE EXCEPTION 'sem órgão'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM licitagov.processos
    WHERE id = p_processo_id AND orgao_id = v_orgao
  ) THEN
    RAISE EXCEPTION 'processo não encontrado no órgão atual';
  END IF;

  SELECT
    v.valor_unitario_estimado,
    v.orgao_nome,
    v.modalidade_nome,
    v.data_publicacao::date,
    v.link_pncp,
    v.descricao
  INTO v_valor, v_orgao_nome, v_modalidade, v_data, v_link, v_item_desc
  FROM licitagov.v_precos_historicos v
  WHERE v.item_id = p_pncp_item_id;

  IF v_valor IS NULL THEN RAISE EXCEPTION 'item PNCP não encontrado'; END IF;

  INSERT INTO licitagov.precos_pesquisa (
    processo_id,
    item_descricao,
    fonte,                       -- valor do whitelist CHECK
    valor_unitario,
    data_referencia,
    link_fonte,                  -- corrigido: era url_fonte (coluna inexistente)
    fornecedor_nome,             -- usado como display do órgão no UI
    metadados
  ) VALUES (
    p_processo_id,
    p_item_descricao,
    'contratacoes_similares',    -- fonte PNCP = contratação análoga
    v_valor,
    v_data,
    v_link,
    v_orgao_nome,                -- órgão que contratou antes
    jsonb_build_object(
      'pncp_item_id', p_pncp_item_id,
      'descricao_pncp', v_item_desc,
      'orgao_nome', v_orgao_nome,
      'modalidade', v_modalidade,
      'origem', 'pncp_v_precos_historicos'
    )
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_preco_pesquisa_from_pncp(UUID, TEXT, UUID) TO authenticated;

-- ─── add_preco_pesquisa_from_painel (rewrite) ─────────────────────────────
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
  v_orgao_nome TEXT;
  v_uasg_nome TEXT;
  v_data DATE;
  v_fonte_url TEXT;
  v_desc TEXT;
  v_forn_nome TEXT;
  v_forn_cnpj TEXT;
  v_modalidade TEXT;
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
    p.orgao_nome,
    p.uasg_nome,
    p.data_homologacao,
    p.fonte_url,
    p.descricao,
    p.fornecedor_nome,
    p.fornecedor_cnpj,
    p.modalidade
  INTO v_valor, v_orgao_nome, v_uasg_nome, v_data, v_fonte_url,
       v_desc, v_forn_nome, v_forn_cnpj, v_modalidade
  FROM licitagov.painel_precos_oficial p
  WHERE p.id = p_painel_id;

  IF v_valor IS NULL THEN RAISE EXCEPTION 'preço não encontrado no Painel Oficial'; END IF;

  INSERT INTO licitagov.precos_pesquisa (
    processo_id,
    item_descricao,
    fonte,                       -- valor do whitelist CHECK
    valor_unitario,
    data_referencia,
    link_fonte,                  -- corrigido: era url_fonte
    fornecedor_cnpj,
    fornecedor_nome,
    metadados
  ) VALUES (
    p_processo_id,
    p_item_descricao,
    'painel_precos',             -- fonte autoritativa oficial (TCU 1.875)
    v_valor,
    v_data,
    v_fonte_url,
    v_forn_cnpj,
    v_forn_nome,
    jsonb_build_object(
      'painel_id', p_painel_id,
      'descricao_painel', v_desc,
      'orgao_nome', v_orgao_nome,
      'uasg_nome', v_uasg_nome,
      'modalidade', v_modalidade,
      'origem', 'painel_oficial_compras_gov'
    )
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.add_preco_pesquisa_from_painel(UUID, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION public.add_preco_pesquisa_from_pncp(UUID, TEXT, UUID)
  IS 'Fix 2026-04-20: link_fonte (era url_fonte) + fonte=contratacoes_similares (era string livre)';
COMMENT ON FUNCTION public.add_preco_pesquisa_from_painel(UUID, TEXT, UUID)
  IS 'Fix 2026-04-20: link_fonte (era url_fonte) + fonte=painel_precos (era string livre)';
