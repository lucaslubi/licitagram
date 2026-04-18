-- ============================================================
-- LICITAGOV: Team invites (multi-user por órgão)
-- ============================================================

CREATE TABLE IF NOT EXISTS licitagov.convites_equipe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orgao_id UUID NOT NULL REFERENCES licitagov.orgaos(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  papel VARCHAR(30) NOT NULL DEFAULT 'requisitante'
    CHECK (papel IN ('requisitante', 'agente_contratacao', 'coordenador', 'assessor_juridico', 'ordenador_despesa', 'admin')),
  token_hash TEXT NOT NULL UNIQUE,
  expira_em TIMESTAMPTZ NOT NULL,
  criado_por UUID REFERENCES licitagov.usuarios(id) ON DELETE SET NULL,
  revogado BOOLEAN NOT NULL DEFAULT FALSE,
  aceito_em TIMESTAMPTZ,
  aceito_por UUID REFERENCES licitagov.usuarios(id) ON DELETE SET NULL,
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_convites_orgao ON licitagov.convites_equipe(orgao_id);
CREATE INDEX IF NOT EXISTS idx_convites_email ON licitagov.convites_equipe(lower(email));

ALTER TABLE licitagov.convites_equipe ENABLE ROW LEVEL SECURITY;

-- Admin do órgão lê e escreve
CREATE POLICY p_convites_select_own ON licitagov.convites_equipe
  FOR SELECT TO authenticated
  USING (
    licitagov.current_user_is_admin() AND orgao_id = licitagov.current_orgao_id()
  );
CREATE POLICY p_convites_admin_write ON licitagov.convites_equipe
  FOR ALL TO authenticated
  USING (licitagov.current_user_is_admin() AND orgao_id = licitagov.current_orgao_id())
  WITH CHECK (orgao_id = licitagov.current_orgao_id());

-- Trigger audit (se ainda não aplicado)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_convites_equipe') THEN
    EXECUTE 'CREATE TRIGGER trg_audit_convites_equipe AFTER INSERT OR UPDATE OR DELETE ON licitagov.convites_equipe FOR EACH ROW EXECUTE FUNCTION licitagov.audit_row_change()';
  END IF;
END $$;

-- ------------------------------------------------------------
-- RPC: create_convite — admin gera convite + token_hash
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_convite_equipe(
  p_email TEXT,
  p_papel VARCHAR(30),
  p_token_hash TEXT,
  p_expira_em TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
DECLARE
  v_orgao_id UUID := licitagov.current_orgao_id();
  v_user_id UUID := auth.uid();
  v_id UUID;
BEGIN
  IF NOT licitagov.current_user_is_admin() THEN RAISE EXCEPTION 'apenas admin/coordenador'; END IF;
  IF p_email IS NULL OR p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'email inválido'; END IF;
  IF p_papel NOT IN ('requisitante','agente_contratacao','coordenador','assessor_juridico','ordenador_despesa','admin') THEN
    RAISE EXCEPTION 'papel inválido';
  END IF;

  INSERT INTO licitagov.convites_equipe (orgao_id, email, papel, token_hash, expira_em, criado_por)
  VALUES (v_orgao_id, lower(trim(p_email)), p_papel, p_token_hash, p_expira_em, v_user_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_convite_equipe(TEXT, VARCHAR(30), TEXT, TIMESTAMPTZ) TO authenticated;

-- ------------------------------------------------------------
-- RPC: resolve_convite — público (acessível SEM auth via token)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_convite_equipe(p_token_hash TEXT)
RETURNS TABLE (
  id UUID,
  email TEXT,
  papel VARCHAR(30),
  orgao_razao_social TEXT,
  orgao_nome_fantasia TEXT,
  expira_em TIMESTAMPTZ,
  aceito_em TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT c.id, c.email, c.papel, o.razao_social, o.nome_fantasia, c.expira_em, c.aceito_em
  FROM licitagov.convites_equipe c
  JOIN licitagov.orgaos o ON o.id = c.orgao_id
  WHERE c.token_hash = p_token_hash
    AND c.revogado = FALSE
    AND c.expira_em > NOW()
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.resolve_convite_equipe(TEXT) TO anon, authenticated;

-- ------------------------------------------------------------
-- RPC: accept_convite — usuário autenticado reivindica o convite,
-- criando/atualizando sua linha em licitagov.usuarios vinculada
-- ao órgão do convite. Email da auth precisa bater.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_convite_equipe(p_token_hash TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_email TEXT;
  v_convite_id UUID;
  v_convite_email TEXT;
  v_convite_papel VARCHAR(30);
  v_convite_orgao_id UUID;
  v_convite_revogado BOOLEAN;
  v_convite_expira_em TIMESTAMPTZ;
  v_convite_aceito_em TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be authenticated'; END IF;

  SELECT c.id, c.email, c.papel, c.orgao_id, c.revogado, c.expira_em, c.aceito_em
  INTO v_convite_id, v_convite_email, v_convite_papel, v_convite_orgao_id,
       v_convite_revogado, v_convite_expira_em, v_convite_aceito_em
  FROM licitagov.convites_equipe c
  WHERE c.token_hash = p_token_hash
  LIMIT 1;

  IF NOT FOUND THEN RAISE EXCEPTION 'convite inválido'; END IF;
  IF v_convite_revogado THEN RAISE EXCEPTION 'convite revogado'; END IF;
  IF v_convite_expira_em <= NOW() THEN RAISE EXCEPTION 'convite expirado'; END IF;
  IF v_convite_aceito_em IS NOT NULL THEN RAISE EXCEPTION 'convite já aceito'; END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  IF lower(v_user_email) <> lower(v_convite_email) THEN
    RAISE EXCEPTION 'email do convite não corresponde ao usuário logado';
  END IF;

  INSERT INTO licitagov.usuarios (id, orgao_id, email, nome_completo, papel)
  VALUES (v_user_id, v_convite_orgao_id, v_user_email, COALESCE(v_user_email, ''), v_convite_papel)
  ON CONFLICT (id) DO UPDATE
    SET orgao_id = EXCLUDED.orgao_id,
        papel = EXCLUDED.papel,
        atualizado_em = NOW();

  UPDATE licitagov.convites_equipe
  SET aceito_em = NOW(), aceito_por = v_user_id
  WHERE id = v_convite_id;

  RETURN v_convite_orgao_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_convite_equipe(TEXT) TO authenticated;

-- ------------------------------------------------------------
-- RPC: list_convites pendentes + list_equipe (membros atuais)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_convites_pendentes()
RETURNS TABLE (id UUID, email TEXT, papel VARCHAR(30), expira_em TIMESTAMPTZ, criado_em TIMESTAMPTZ, aceito_em TIMESTAMPTZ, revogado BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT id, email, papel, expira_em, criado_em, aceito_em, revogado
  FROM licitagov.convites_equipe
  WHERE orgao_id = licitagov.current_orgao_id()
  ORDER BY criado_em DESC
  LIMIT 100
$$;
GRANT EXECUTE ON FUNCTION public.list_convites_pendentes() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_equipe()
RETURNS TABLE (id UUID, email TEXT, nome_completo TEXT, cargo TEXT, papel VARCHAR(30), mfa_habilitado BOOLEAN, ultimo_acesso_em TIMESTAMPTZ, criado_em TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT u.id, u.email, u.nome_completo, u.cargo, u.papel, u.mfa_habilitado, u.ultimo_acesso_em, u.criado_em
  FROM licitagov.usuarios u
  WHERE u.orgao_id = licitagov.current_orgao_id()
  ORDER BY u.criado_em
$$;
GRANT EXECUTE ON FUNCTION public.list_equipe() TO authenticated;

-- ------------------------------------------------------------
-- RPC: revoke_convite + remove_membro
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_convite_equipe(p_id UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = licitagov, public, pg_temp AS $$
BEGIN
  IF NOT licitagov.current_user_is_admin() THEN RAISE EXCEPTION 'apenas admin/coordenador'; END IF;
  UPDATE licitagov.convites_equipe SET revogado = TRUE
  WHERE id = p_id AND orgao_id = licitagov.current_orgao_id();
  RETURN FOUND;
END;$$;
GRANT EXECUTE ON FUNCTION public.revoke_convite_equipe(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_membro_equipe(p_user_id UUID, p_novo_papel VARCHAR(30) DEFAULT 'requisitante')
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = licitagov, public, pg_temp AS $$
DECLARE v_orgao_id UUID := licitagov.current_orgao_id();
BEGIN
  IF NOT licitagov.current_user_is_admin() THEN RAISE EXCEPTION 'apenas admin/coordenador'; END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'não é possível remover a si mesmo'; END IF;
  -- Não deletamos a linha (preserva histórico de atos); apenas rebaixa papel e mantém vinculo.
  -- Para remoção plena: usar LGPD delete.
  UPDATE licitagov.usuarios SET papel = p_novo_papel, atualizado_em = NOW()
  WHERE id = p_user_id AND orgao_id = v_orgao_id;
  RETURN FOUND;
END;$$;
GRANT EXECUTE ON FUNCTION public.remove_membro_equipe(UUID, VARCHAR(30)) TO authenticated;

COMMENT ON TABLE licitagov.convites_equipe IS 'Team invites por órgão — token_hash SHA-256 (token em claro só no email).';
