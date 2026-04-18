-- ============================================================
-- LICITAGOV: Phase 3 Part A (PCA Collector — Campanha)
-- ============================================================
-- RLS policies pra setores/campanhas_pca/respostas_setor/itens_pca.
-- RPCs pra criar campanha com respostas_setor atomicamente, e resolver
-- token público do setor (público, sem auth — acessado via /s/[token]).
-- ============================================================

-- ------------------------------------------------------------
-- Helper: verifica se o auth.uid() é admin/coordenador do órgão
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION licitagov.current_user_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = licitagov, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM licitagov.usuarios
    WHERE id = auth.uid() AND papel IN ('admin', 'coordenador')
  )
$$;
GRANT EXECUTE ON FUNCTION licitagov.current_user_is_admin() TO authenticated;

-- ------------------------------------------------------------
-- RLS SETORES: INSERT/UPDATE/DELETE (apenas admin/coordenador do órgão)
-- ------------------------------------------------------------
CREATE POLICY p_setores_admin_write ON licitagov.setores
  FOR INSERT TO authenticated
  WITH CHECK (
    licitagov.current_user_is_admin()
    AND orgao_id = licitagov.current_orgao_id()
  );

CREATE POLICY p_setores_admin_update ON licitagov.setores
  FOR UPDATE TO authenticated
  USING (
    licitagov.current_user_is_admin()
    AND orgao_id = licitagov.current_orgao_id()
  )
  WITH CHECK (
    licitagov.current_user_is_admin()
    AND orgao_id = licitagov.current_orgao_id()
  );

CREATE POLICY p_setores_admin_delete ON licitagov.setores
  FOR DELETE TO authenticated
  USING (
    licitagov.current_user_is_admin()
    AND orgao_id = licitagov.current_orgao_id()
  );

-- ------------------------------------------------------------
-- RLS CAMPANHAS_PCA
-- ------------------------------------------------------------
CREATE POLICY p_campanhas_select_own ON licitagov.campanhas_pca
  FOR SELECT TO authenticated
  USING (orgao_id = licitagov.current_orgao_id());

CREATE POLICY p_campanhas_admin_write ON licitagov.campanhas_pca
  FOR INSERT TO authenticated
  WITH CHECK (
    licitagov.current_user_is_admin()
    AND orgao_id = licitagov.current_orgao_id()
  );

CREATE POLICY p_campanhas_admin_update ON licitagov.campanhas_pca
  FOR UPDATE TO authenticated
  USING (
    licitagov.current_user_is_admin()
    AND orgao_id = licitagov.current_orgao_id()
  )
  WITH CHECK (orgao_id = licitagov.current_orgao_id());

-- ------------------------------------------------------------
-- RLS RESPOSTAS_SETOR (via campanha → orgao_id)
-- ------------------------------------------------------------
CREATE POLICY p_respostas_select_own_org ON licitagov.respostas_setor
  FOR SELECT TO authenticated
  USING (
    campanha_pca_id IN (
      SELECT id FROM licitagov.campanhas_pca WHERE orgao_id = licitagov.current_orgao_id()
    )
  );

CREATE POLICY p_respostas_admin_update ON licitagov.respostas_setor
  FOR UPDATE TO authenticated
  USING (
    licitagov.current_user_is_admin()
    AND campanha_pca_id IN (
      SELECT id FROM licitagov.campanhas_pca WHERE orgao_id = licitagov.current_orgao_id()
    )
  )
  WITH CHECK (
    campanha_pca_id IN (
      SELECT id FROM licitagov.campanhas_pca WHERE orgao_id = licitagov.current_orgao_id()
    )
  );

-- ------------------------------------------------------------
-- RLS ITENS_PCA (via campanha → orgao)
-- ------------------------------------------------------------
CREATE POLICY p_itens_select_own_org ON licitagov.itens_pca
  FOR SELECT TO authenticated
  USING (
    campanha_pca_id IN (
      SELECT id FROM licitagov.campanhas_pca WHERE orgao_id = licitagov.current_orgao_id()
    )
  );

CREATE POLICY p_itens_admin_update ON licitagov.itens_pca
  FOR UPDATE TO authenticated
  USING (
    licitagov.current_user_is_admin()
    AND campanha_pca_id IN (
      SELECT id FROM licitagov.campanhas_pca WHERE orgao_id = licitagov.current_orgao_id()
    )
  )
  WITH CHECK (
    campanha_pca_id IN (
      SELECT id FROM licitagov.campanhas_pca WHERE orgao_id = licitagov.current_orgao_id()
    )
  );

CREATE POLICY p_itens_admin_delete ON licitagov.itens_pca
  FOR DELETE TO authenticated
  USING (
    licitagov.current_user_is_admin()
    AND campanha_pca_id IN (
      SELECT id FROM licitagov.campanhas_pca WHERE orgao_id = licitagov.current_orgao_id()
    )
  );

-- ------------------------------------------------------------
-- RPC: public.create_pca_campanha
-- Cria campanha + respostas_setor com token_hash atômico.
-- Cliente gera tokens no server action (crypto.randomBytes) e envia os
-- HASHES (não os tokens em claro). Retorna o id da campanha + a lista
-- de tokens em claro pra enviar por email (nunca re-consultáveis).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_pca_campanha(
  p_ano INTEGER,
  p_titulo TEXT,
  p_prazo_resposta_em TIMESTAMPTZ,
  p_setores JSONB  -- array de { setor_id: UUID, token_hash: TEXT, expira_em: TIMESTAMPTZ }
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_orgao_id UUID := licitagov.current_orgao_id();
  v_campanha_id UUID;
  v_setor JSONB;
  v_is_admin BOOLEAN := licitagov.current_user_is_admin();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be authenticated'; END IF;
  IF v_orgao_id IS NULL THEN RAISE EXCEPTION 'usuario sem órgão'; END IF;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'apenas admin/coordenador pode criar campanha'; END IF;
  IF p_ano < 2024 OR p_ano > 2099 THEN RAISE EXCEPTION 'ano inválido'; END IF;
  IF p_prazo_resposta_em <= NOW() THEN RAISE EXCEPTION 'prazo deve estar no futuro'; END IF;
  IF jsonb_array_length(p_setores) < 1 THEN RAISE EXCEPTION 'pelo menos 1 setor é obrigatório'; END IF;

  -- Cria a campanha (ON CONFLICT atualiza)
  INSERT INTO licitagov.campanhas_pca (orgao_id, ano, titulo, prazo_resposta_em, status, criado_por)
  VALUES (v_orgao_id, p_ano, p_titulo, p_prazo_resposta_em, 'coletando', v_user_id)
  ON CONFLICT (orgao_id, ano) DO UPDATE
    SET titulo = EXCLUDED.titulo,
        prazo_resposta_em = EXCLUDED.prazo_resposta_em,
        status = CASE
          WHEN licitagov.campanhas_pca.status IN ('rascunho', 'coletando') THEN 'coletando'
          ELSE licitagov.campanhas_pca.status
        END,
        atualizado_em = NOW()
  RETURNING id INTO v_campanha_id;

  -- Cria respostas_setor (uma por setor) com token_hash
  FOR v_setor IN SELECT * FROM jsonb_array_elements(p_setores)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM licitagov.setores
      WHERE id = (v_setor->>'setor_id')::uuid AND orgao_id = v_orgao_id
    ) THEN
      RAISE EXCEPTION 'setor % não pertence ao órgão', v_setor->>'setor_id';
    END IF;

    INSERT INTO licitagov.respostas_setor (campanha_pca_id, setor_id, token_hash, expira_em)
    VALUES (
      v_campanha_id,
      (v_setor->>'setor_id')::uuid,
      v_setor->>'token_hash',
      (v_setor->>'expira_em')::timestamptz
    )
    ON CONFLICT (token_hash) DO NOTHING;
  END LOOP;

  RETURN v_campanha_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_pca_campanha(INTEGER, TEXT, TIMESTAMPTZ, JSONB) TO authenticated;

-- ------------------------------------------------------------
-- RPC: public.resolve_campanha_token
-- Retorna dados da campanha + setor pra UM token válido. Acessível
-- SEM auth (público) — usa SECURITY DEFINER pra dar bypass de RLS.
-- Retorna 0 linhas se token não existe, está revogado ou expirou.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_campanha_token(p_token_hash TEXT)
RETURNS TABLE (
  resposta_id UUID,
  campanha_id UUID,
  campanha_ano INTEGER,
  campanha_titulo TEXT,
  campanha_status VARCHAR(20),
  setor_id UUID,
  setor_nome TEXT,
  setor_sigla TEXT,
  orgao_id UUID,
  orgao_razao_social TEXT,
  orgao_nome_fantasia TEXT,
  expira_em TIMESTAMPTZ,
  respondido_em TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT
    r.id,
    c.id,
    c.ano,
    c.titulo,
    c.status,
    s.id,
    s.nome,
    s.sigla,
    o.id,
    o.razao_social,
    o.nome_fantasia,
    r.expira_em,
    r.respondido_em
  FROM licitagov.respostas_setor r
  JOIN licitagov.campanhas_pca c ON c.id = r.campanha_pca_id
  JOIN licitagov.setores s ON s.id = r.setor_id
  JOIN licitagov.orgaos o ON o.id = c.orgao_id
  WHERE r.token_hash = p_token_hash
    AND r.revogado = FALSE
    AND r.expira_em > NOW()
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.resolve_campanha_token(TEXT) TO anon, authenticated;

-- ------------------------------------------------------------
-- RPC: public.submit_setor_itens
-- Setor usa o token pra submeter array de itens. Rate-limited via
-- unique token, sem auth.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_setor_itens(
  p_token_hash TEXT,
  p_itens JSONB  -- array de { descricao_livre, quantidade?, unidade_medida?, mes_demanda?, justificativa? }
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
DECLARE
  v_resposta RECORD;
  v_item JSONB;
  v_count INTEGER := 0;
BEGIN
  SELECT r.id, r.campanha_pca_id, r.setor_id, r.revogado, r.expira_em
  INTO v_resposta
  FROM licitagov.respostas_setor r
  WHERE r.token_hash = p_token_hash
  LIMIT 1;

  IF v_resposta IS NULL THEN RAISE EXCEPTION 'token inválido'; END IF;
  IF v_resposta.revogado THEN RAISE EXCEPTION 'token revogado'; END IF;
  IF v_resposta.expira_em <= NOW() THEN RAISE EXCEPTION 'token expirado'; END IF;

  -- Limpa itens anteriores desse setor nessa campanha (permite re-submit)
  DELETE FROM licitagov.itens_pca
  WHERE campanha_pca_id = v_resposta.campanha_pca_id
    AND setor_id = v_resposta.setor_id;

  -- Insere novos itens
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    INSERT INTO licitagov.itens_pca (
      campanha_pca_id, setor_id, descricao_livre, quantidade, unidade_medida,
      mes_demanda, justificativa
    )
    VALUES (
      v_resposta.campanha_pca_id,
      v_resposta.setor_id,
      v_item->>'descricao_livre',
      NULLIF(v_item->>'quantidade', '')::numeric,
      NULLIF(v_item->>'unidade_medida', ''),
      NULLIF(v_item->>'mes_demanda', '')::integer,
      NULLIF(v_item->>'justificativa', '')
    );
    v_count := v_count + 1;
  END LOOP;

  -- Marca respondido
  UPDATE licitagov.respostas_setor
  SET respondido_em = NOW(),
      snapshot = p_itens,
      atualizado_em = NOW()
  WHERE id = v_resposta.id;

  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_setor_itens(TEXT, JSONB) TO anon, authenticated;

-- ------------------------------------------------------------
-- RPC: public.revoke_pca_token
-- Admin revoga um token específico (ex: link vazou).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_pca_token(p_resposta_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
DECLARE
  v_orgao_id UUID := licitagov.current_orgao_id();
  v_is_admin BOOLEAN := licitagov.current_user_is_admin();
BEGIN
  IF NOT v_is_admin THEN RAISE EXCEPTION 'apenas admin/coordenador'; END IF;

  UPDATE licitagov.respostas_setor r
  SET revogado = TRUE, atualizado_em = NOW()
  WHERE r.id = p_resposta_id
    AND r.campanha_pca_id IN (SELECT id FROM licitagov.campanhas_pca WHERE orgao_id = v_orgao_id);

  RETURN FOUND;
END;
$$;
GRANT EXECUTE ON FUNCTION public.revoke_pca_token(UUID) TO authenticated;

-- ------------------------------------------------------------
-- RPC: public.list_campanhas — lista campanhas do órgão com contadores
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_campanhas()
RETURNS TABLE (
  id UUID,
  ano INTEGER,
  titulo TEXT,
  status VARCHAR(20),
  prazo_resposta_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ,
  setores_total BIGINT,
  setores_respondidos BIGINT,
  itens_total BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT
    c.id, c.ano, c.titulo, c.status, c.prazo_resposta_em, c.criado_em,
    (SELECT COUNT(*) FROM licitagov.respostas_setor r WHERE r.campanha_pca_id = c.id) AS setores_total,
    (SELECT COUNT(*) FROM licitagov.respostas_setor r WHERE r.campanha_pca_id = c.id AND r.respondido_em IS NOT NULL) AS setores_respondidos,
    (SELECT COUNT(*) FROM licitagov.itens_pca i WHERE i.campanha_pca_id = c.id) AS itens_total
  FROM licitagov.campanhas_pca c
  WHERE c.orgao_id = licitagov.current_orgao_id()
  ORDER BY c.ano DESC, c.criado_em DESC
$$;
GRANT EXECUTE ON FUNCTION public.list_campanhas() TO authenticated;

-- ------------------------------------------------------------
-- RPC: public.get_campanha_detail — detalhes + respostas por setor
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_campanha_detail(p_campanha_id UUID)
RETURNS TABLE (
  id UUID,
  ano INTEGER,
  titulo TEXT,
  status VARCHAR(20),
  prazo_resposta_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ,
  resposta_id UUID,
  setor_id UUID,
  setor_nome TEXT,
  setor_sigla TEXT,
  expira_em TIMESTAMPTZ,
  respondido_em TIMESTAMPTZ,
  revogado BOOLEAN,
  itens_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT
    c.id, c.ano, c.titulo, c.status, c.prazo_resposta_em, c.criado_em,
    r.id, s.id, s.nome, s.sigla,
    r.expira_em, r.respondido_em, r.revogado,
    (SELECT COUNT(*) FROM licitagov.itens_pca i
       WHERE i.campanha_pca_id = c.id AND i.setor_id = s.id) AS itens_count
  FROM licitagov.campanhas_pca c
  JOIN licitagov.respostas_setor r ON r.campanha_pca_id = c.id
  JOIN licitagov.setores s ON s.id = r.setor_id
  WHERE c.id = p_campanha_id
    AND c.orgao_id = licitagov.current_orgao_id()
  ORDER BY s.nome
$$;
GRANT EXECUTE ON FUNCTION public.get_campanha_detail(UUID) TO authenticated;

COMMENT ON FUNCTION public.create_pca_campanha IS 'Phase 3 PCA Collector: cria campanha + respostas_setor com token_hash em transação.';
COMMENT ON FUNCTION public.resolve_campanha_token IS 'Público (anon OK): resolve token do setor pra landing page /s/[token].';
COMMENT ON FUNCTION public.submit_setor_itens IS 'Público: setor submete itens via token. Upsert total (replaces previous items).';
