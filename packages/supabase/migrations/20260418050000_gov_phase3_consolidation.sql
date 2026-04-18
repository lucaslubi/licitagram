-- ============================================================
-- LICITAGOV: Phase 3 Parte C (Consolidação + Publicação)
-- ============================================================
-- RPCs necessárias:
--   - public.get_campanha_itens_consolidacao: retorna todos itens com
--     nome do setor e histórico (pra Claude analisar duplicatas)
--   - public.set_campanha_status: admin muda status (coletando →
--     consolidando → aprovado → publicado)
--   - public.save_campanha_consolidacao: persiste resultado da IA
--     (jsonb com duplicatas, insights, recomendações) no metadata
-- ============================================================

-- ------------------------------------------------------------
-- Coluna para armazenar resultado consolidado (JSONB)
-- ------------------------------------------------------------
ALTER TABLE licitagov.campanhas_pca
  ADD COLUMN IF NOT EXISTS consolidacao JSONB;

-- ------------------------------------------------------------
-- RPC: get_campanha_itens_consolidacao
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_campanha_itens_consolidacao(p_campanha_id UUID)
RETURNS TABLE (
  item_id UUID,
  setor_id UUID,
  setor_nome TEXT,
  descricao_livre TEXT,
  descricao_normalizada TEXT,
  quantidade NUMERIC,
  unidade_medida VARCHAR(50),
  mes_demanda INTEGER,
  categoria TEXT,
  codigo_catmat VARCHAR(20),
  justificativa TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT
    i.id,
    i.setor_id,
    s.nome,
    i.descricao_livre,
    i.descricao_normalizada,
    i.quantidade,
    i.unidade_medida,
    i.mes_demanda,
    i.categoria,
    i.codigo_catmat,
    i.justificativa
  FROM licitagov.itens_pca i
  JOIN licitagov.setores s ON s.id = i.setor_id
  JOIN licitagov.campanhas_pca c ON c.id = i.campanha_pca_id
  WHERE c.id = p_campanha_id
    AND c.orgao_id = licitagov.current_orgao_id()
  ORDER BY s.nome, i.descricao_livre
$$;
GRANT EXECUTE ON FUNCTION public.get_campanha_itens_consolidacao(UUID) TO authenticated;

-- ------------------------------------------------------------
-- RPC: set_campanha_status
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_campanha_status(
  p_campanha_id UUID,
  p_status VARCHAR(20)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
BEGIN
  IF NOT licitagov.current_user_is_admin() THEN
    RAISE EXCEPTION 'apenas admin/coordenador';
  END IF;
  IF p_status NOT IN ('rascunho', 'coletando', 'consolidando', 'aprovado', 'publicado', 'arquivado') THEN
    RAISE EXCEPTION 'status inválido: %', p_status;
  END IF;

  UPDATE licitagov.campanhas_pca
  SET status = p_status, atualizado_em = NOW()
  WHERE id = p_campanha_id
    AND orgao_id = licitagov.current_orgao_id();

  RETURN FOUND;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_campanha_status(UUID, VARCHAR(20)) TO authenticated;

-- ------------------------------------------------------------
-- RPC: save_campanha_consolidacao
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_campanha_consolidacao(
  p_campanha_id UUID,
  p_consolidacao JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
BEGIN
  IF NOT licitagov.current_user_is_admin() THEN
    RAISE EXCEPTION 'apenas admin/coordenador';
  END IF;

  UPDATE licitagov.campanhas_pca
  SET consolidacao = p_consolidacao,
      status = CASE
        WHEN status IN ('rascunho', 'coletando', 'consolidando') THEN 'consolidando'
        ELSE status
      END,
      atualizado_em = NOW()
  WHERE id = p_campanha_id
    AND orgao_id = licitagov.current_orgao_id();

  RETURN FOUND;
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_campanha_consolidacao(UUID, JSONB) TO authenticated;

-- ------------------------------------------------------------
-- RPC: get_campanha_consolidacao — retorna consolidação salva
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_campanha_consolidacao(p_campanha_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT consolidacao
  FROM licitagov.campanhas_pca
  WHERE id = p_campanha_id
    AND orgao_id = licitagov.current_orgao_id()
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_campanha_consolidacao(UUID) TO authenticated;

-- ------------------------------------------------------------
-- RPC: get_orgao_historico_pncp — sugestões via v_historico_pncp
-- Usada pelo form público /s/[token] pra IA sugerir itens baseados
-- no histórico de compras do órgão.
-- Retorna tenders analisados do mesmo orgao_cnpj + filtro setor opcional.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_orgao_historico_pncp(
  p_token_hash TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  objeto TEXT,
  valor_estimado NUMERIC,
  valor_homologado NUMERIC,
  modalidade_nome TEXT,
  data_publicacao TIMESTAMPTZ,
  uf CHAR(2),
  municipio TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
DECLARE
  v_orgao_cnpj VARCHAR(14);
  v_resposta RECORD;
BEGIN
  -- Valida token primeiro
  SELECT r.id, r.campanha_pca_id, r.revogado, r.expira_em INTO v_resposta
  FROM licitagov.respostas_setor r
  WHERE r.token_hash = p_token_hash LIMIT 1;
  IF v_resposta IS NULL OR v_resposta.revogado OR v_resposta.expira_em <= NOW() THEN
    RETURN;
  END IF;

  -- Busca CNPJ do órgão da campanha
  SELECT o.cnpj INTO v_orgao_cnpj
  FROM licitagov.campanhas_pca c
  JOIN licitagov.orgaos o ON o.id = c.orgao_id
  WHERE c.id = v_resposta.campanha_pca_id
  LIMIT 1;

  IF v_orgao_cnpj IS NULL THEN RETURN; END IF;

  -- Query histórico via VIEW pública read-only
  RETURN QUERY
    SELECT h.objeto, h.valor_estimado, h.valor_homologado,
           h.modalidade_nome, h.data_publicacao, h.uf, h.municipio
    FROM licitagov.v_historico_pncp h
    WHERE h.orgao_cnpj = v_orgao_cnpj
    ORDER BY h.data_publicacao DESC NULLS LAST
    LIMIT LEAST(p_limit, 50);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_orgao_historico_pncp(TEXT, INTEGER) TO anon, authenticated;

COMMENT ON COLUMN licitagov.campanhas_pca.consolidacao IS
  'Resultado JSON da consolidação IA: { duplicatas: [...], insights: [...], fracionamentos: [...], valor_total: number }';
