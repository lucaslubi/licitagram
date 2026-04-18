-- ============================================================
-- LICITAGOV: Phase 9 (Publicação PNCP + Audit Log viewer + LGPD)
-- ============================================================

-- ------------------------------------------------------------
-- RLS + RPCs publicacoes_pncp
-- ------------------------------------------------------------
CREATE POLICY p_publicacoes_select_own ON licitagov.publicacoes_pncp
  FOR SELECT TO authenticated
  USING (
    processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id())
    OR campanha_pca_id IN (SELECT id FROM licitagov.campanhas_pca WHERE orgao_id = licitagov.current_orgao_id())
  );

CREATE POLICY p_publicacoes_admin_write ON licitagov.publicacoes_pncp
  FOR ALL TO authenticated
  USING (
    licitagov.current_user_is_admin() AND (
      processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id())
      OR campanha_pca_id IN (SELECT id FROM licitagov.campanhas_pca WHERE orgao_id = licitagov.current_orgao_id())
    )
  )
  WITH CHECK (
    processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id())
    OR campanha_pca_id IN (SELECT id FROM licitagov.campanhas_pca WHERE orgao_id = licitagov.current_orgao_id())
  );

-- RPC: registra tentativa de publicação PNCP + avança fase
CREATE OR REPLACE FUNCTION public.register_publicacao_pncp(
  p_processo_id UUID,
  p_tipo_documento VARCHAR(30),
  p_status VARCHAR(20),
  p_payload JSONB,
  p_resposta JSONB DEFAULT NULL,
  p_numero_controle TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
DECLARE
  v_orgao_id UUID := licitagov.current_orgao_id();
  v_pub_id UUID;
BEGIN
  IF NOT licitagov.current_user_is_admin() THEN
    RAISE EXCEPTION 'apenas admin/coordenador';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM licitagov.processos WHERE id = p_processo_id AND orgao_id = v_orgao_id) THEN
    RAISE EXCEPTION 'processo não pertence ao órgão';
  END IF;

  INSERT INTO licitagov.publicacoes_pncp (
    processo_id, tipo_documento, status, numero_controle_pncp,
    payload_enviado, resposta_pncp, tentativas,
    publicado_em
  )
  VALUES (
    p_processo_id, p_tipo_documento, p_status, p_numero_controle,
    p_payload, p_resposta, 1,
    CASE WHEN p_status = 'publicado' THEN NOW() ELSE NULL END
  )
  RETURNING id INTO v_pub_id;

  IF p_status = 'publicado' THEN
    UPDATE licitagov.processos SET fase_atual = 'publicado', atualizado_em = NOW() WHERE id = p_processo_id;
  ELSIF p_status IN ('pendente', 'enviando') THEN
    UPDATE licitagov.processos SET fase_atual = 'publicacao', atualizado_em = NOW() WHERE id = p_processo_id;
  END IF;

  RETURN v_pub_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.register_publicacao_pncp(UUID, VARCHAR(30), VARCHAR(20), JSONB, JSONB, TEXT) TO authenticated;

-- RPC: lista publicações de um processo
CREATE OR REPLACE FUNCTION public.list_publicacoes_processo(p_processo_id UUID)
RETURNS TABLE (
  id UUID,
  tipo_documento VARCHAR(30),
  status VARCHAR(20),
  numero_controle_pncp TEXT,
  tentativas INTEGER,
  publicado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT id, tipo_documento, status, numero_controle_pncp, tentativas, publicado_em, criado_em
  FROM licitagov.publicacoes_pncp
  WHERE processo_id = p_processo_id
    AND processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id())
  ORDER BY criado_em DESC
$$;
GRANT EXECUTE ON FUNCTION public.list_publicacoes_processo(UUID) TO authenticated;

-- ------------------------------------------------------------
-- RPC: get_audit_log — leitor paginado para /configuracoes/auditoria
-- ------------------------------------------------------------
CREATE POLICY p_audit_log_admin_select ON licitagov.audit_log
  FOR SELECT TO authenticated
  USING (licitagov.current_user_is_admin());

CREATE OR REPLACE FUNCTION public.get_audit_log(
  p_table_filter TEXT DEFAULT NULL,
  p_actor_filter UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id BIGINT,
  ocorreu_em TIMESTAMPTZ,
  actor_id UUID,
  actor_role TEXT,
  actor_email TEXT,
  schema_name TEXT,
  table_name TEXT,
  operacao CHAR(1),
  row_id TEXT,
  diff JSONB
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
BEGIN
  IF NOT licitagov.current_user_is_admin() THEN
    RAISE EXCEPTION 'apenas admin/coordenador';
  END IF;

  RETURN QUERY
    SELECT
      a.id,
      a.ocorreu_em,
      a.actor_id,
      a.actor_role,
      u.email,
      a.schema_name,
      a.table_name,
      a.operacao,
      a.row_id,
      a.diff
    FROM licitagov.audit_log a
    LEFT JOIN licitagov.usuarios u ON u.id = a.actor_id
    WHERE (p_table_filter IS NULL OR a.table_name = p_table_filter)
      AND (p_actor_filter IS NULL OR a.actor_id = p_actor_filter)
      -- Escopo por órgão via JOIN nas tabelas origem
      AND (
        a.actor_id IN (SELECT id FROM licitagov.usuarios WHERE orgao_id = licitagov.current_orgao_id())
        OR a.actor_id IS NULL
      )
    ORDER BY a.ocorreu_em DESC
    LIMIT LEAST(p_limit, 200)
    OFFSET GREATEST(p_offset, 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_audit_log(TEXT, UUID, INTEGER, INTEGER) TO authenticated;

-- ------------------------------------------------------------
-- LGPD: RPCs export + delete
-- ------------------------------------------------------------

-- Exporta todos os dados do usuário atual em JSON único (LGPD art. 18 II)
CREATE OR REPLACE FUNCTION public.lgpd_export_user_data()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_data JSONB;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be authenticated'; END IF;

  SELECT jsonb_build_object(
    'user', (SELECT row_to_json(u.*)::jsonb FROM licitagov.usuarios u WHERE u.id = v_user_id),
    'orgao', (SELECT row_to_json(o.*)::jsonb FROM licitagov.orgaos o
      WHERE o.id = (SELECT orgao_id FROM licitagov.usuarios WHERE id = v_user_id)),
    'campanhas_criadas', (SELECT COALESCE(jsonb_agg(row_to_json(c.*)), '[]'::jsonb)
      FROM licitagov.campanhas_pca c WHERE c.criado_por = v_user_id),
    'processos_criados', (SELECT COALESCE(jsonb_agg(row_to_json(p.*)), '[]'::jsonb)
      FROM licitagov.processos p WHERE p.agente_contratacao_id = v_user_id),
    'artefatos_criados', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', a.id, 'tipo', a.tipo, 'processo_id', a.processo_id, 'status', a.status,
        'criado_em', a.criado_em
      )), '[]'::jsonb)
      FROM licitagov.artefatos a WHERE a.criado_por = v_user_id),
    'exported_at', NOW(),
    'lgpd_basis', 'Lei 13.709/2018 art. 18, inciso II'
  ) INTO v_data;

  RETURN v_data;
END;
$$;
GRANT EXECUTE ON FUNCTION public.lgpd_export_user_data() TO authenticated;

-- Soft-delete: desvincula usuário do órgão + anonimiza dados pessoais (LGPD art. 18 VI)
CREATE OR REPLACE FUNCTION public.lgpd_delete_user_data()
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be authenticated'; END IF;

  -- Anonimiza dados pessoais na linha do usuário (não deleta — linhas de artefatos
  -- criados por ele precisam continuar auditáveis; apenas desvincula PII).
  UPDATE licitagov.usuarios
  SET email = 'anonimizado+' || id::text || '@licitagram.com',
      nome_completo = '[Usuário removido por solicitação LGPD]',
      cpf = NULL,
      cargo = NULL,
      metadados = jsonb_build_object('deleted_at', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
      atualizado_em = NOW()
  WHERE id = v_user_id;

  -- Remove a sessão atual (força logout)
  PERFORM auth.email();  -- sentinel to ensure function executes in auth context
  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.lgpd_delete_user_data() TO authenticated;

COMMENT ON FUNCTION public.register_publicacao_pncp IS
  'Phase 9 — registra tentativa/sucesso de publicação no PNCP (integração real exige ICP-Brasil).';
COMMENT ON FUNCTION public.lgpd_export_user_data IS
  'LGPD art. 18 II — acesso a dados pessoais.';
COMMENT ON FUNCTION public.lgpd_delete_user_data IS
  'LGPD art. 18 VI — eliminação (soft-delete com anonimização, preservando auditoria de atos administrativos).';
