-- ============================================================
-- LICITAGOV: move Phase 2 RPCs to public schema
-- ============================================================
-- O Supabase JS client (`supabase.rpc()`) consulta o schema 'public' por
-- default, e expor o schema 'licitagov' inteiro via PostgREST aumentaria
-- a superfície de ataque (audit_log, perfis_regulatorios etc.). A solução
-- correta: declarar APENAS as RPCs necessárias em public, deixando elas
-- acessarem licitagov internamente via SECURITY DEFINER.
-- ============================================================

-- Drop se já existir (idempotente em re-runs).
DROP FUNCTION IF EXISTS public.bootstrap_orgao(
  VARCHAR(14), TEXT, TEXT, VARCHAR(10), VARCHAR(20),
  CHAR(2), TEXT, VARCHAR(7), VARCHAR(4),
  TEXT, TEXT, VARCHAR(30), TEXT
);
DROP FUNCTION IF EXISTS public.get_current_profile();

-- ------------------------------------------------------------
-- public.bootstrap_orgao — wrapper exposto via PostgREST
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bootstrap_orgao(
  p_cnpj VARCHAR(14),
  p_razao_social TEXT,
  p_nome_fantasia TEXT,
  p_esfera VARCHAR(10),
  p_poder VARCHAR(20),
  p_uf CHAR(2),
  p_municipio TEXT,
  p_codigo_ibge VARCHAR(7),
  p_natureza_juridica VARCHAR(4),
  p_nome_completo TEXT,
  p_cargo TEXT,
  p_papel VARCHAR(30),
  p_objetivo TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_orgao_id UUID;
  v_email TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'must be authenticated';
  END IF;

  IF p_cnpj IS NULL OR length(p_cnpj) <> 14 THEN
    RAISE EXCEPTION 'cnpj inválido';
  END IF;

  IF p_papel IS NULL OR p_papel NOT IN ('requisitante', 'agente_contratacao', 'coordenador', 'assessor_juridico', 'ordenador_despesa', 'admin') THEN
    p_papel := 'admin';
  END IF;

  SELECT id INTO v_orgao_id FROM licitagov.orgaos WHERE cnpj = p_cnpj;
  IF v_orgao_id IS NULL THEN
    INSERT INTO licitagov.orgaos (
      cnpj, razao_social, nome_fantasia, esfera, poder,
      uf, municipio, codigo_ibge, natureza_juridica
    )
    VALUES (
      p_cnpj, p_razao_social, NULLIF(p_nome_fantasia, ''), p_esfera, NULLIF(p_poder, ''),
      NULLIF(p_uf, ''), NULLIF(p_municipio, ''), NULLIF(p_codigo_ibge, ''), NULLIF(p_natureza_juridica, '')
    )
    RETURNING id INTO v_orgao_id;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  INSERT INTO licitagov.usuarios (id, orgao_id, email, nome_completo, cargo, papel, metadados)
  VALUES (
    v_user_id,
    v_orgao_id,
    COALESCE(v_email, ''),
    p_nome_completo,
    NULLIF(p_cargo, ''),
    p_papel,
    jsonb_build_object(
      'objetivo', p_objetivo,
      'onboarding_completed_at', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  )
  ON CONFLICT (id) DO UPDATE
    SET orgao_id = EXCLUDED.orgao_id,
        nome_completo = EXCLUDED.nome_completo,
        cargo = EXCLUDED.cargo,
        papel = CASE WHEN licitagov.usuarios.papel = 'admin' THEN licitagov.usuarios.papel ELSE EXCLUDED.papel END,
        metadados = licitagov.usuarios.metadados || EXCLUDED.metadados,
        atualizado_em = NOW();

  RETURN v_orgao_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_orgao(
  VARCHAR(14), TEXT, TEXT, VARCHAR(10), VARCHAR(20),
  CHAR(2), TEXT, VARCHAR(7), VARCHAR(4),
  TEXT, TEXT, VARCHAR(30), TEXT
) TO authenticated;

-- ------------------------------------------------------------
-- public.get_current_profile — wrapper exposto via PostgREST
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_profile()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  nome_completo TEXT,
  cargo TEXT,
  papel VARCHAR(30),
  mfa_habilitado BOOLEAN,
  orgao_id UUID,
  orgao_cnpj VARCHAR(14),
  orgao_razao_social TEXT,
  orgao_nome_fantasia TEXT,
  orgao_esfera VARCHAR(10),
  orgao_uf CHAR(2),
  orgao_municipio TEXT,
  onboarded_at TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT
    u.id,
    u.email,
    u.nome_completo,
    u.cargo,
    u.papel,
    u.mfa_habilitado,
    o.id,
    o.cnpj,
    o.razao_social,
    o.nome_fantasia,
    o.esfera,
    o.uf,
    o.municipio,
    u.metadados->>'onboarding_completed_at'
  FROM licitagov.usuarios u
  LEFT JOIN licitagov.orgaos o ON o.id = u.orgao_id
  WHERE u.id = auth.uid()
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_current_profile() TO authenticated;

-- ------------------------------------------------------------
-- Drop as versões em licitagov.* (não são mais necessárias).
-- O helper licitagov.current_orgao_id() FICA — é usado pelas RLS policies.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS licitagov.bootstrap_orgao(
  VARCHAR(14), TEXT, TEXT, VARCHAR(10), VARCHAR(20),
  CHAR(2), TEXT, VARCHAR(7), VARCHAR(4),
  TEXT, TEXT, VARCHAR(30), TEXT
);
DROP FUNCTION IF EXISTS licitagov.get_current_profile();

COMMENT ON FUNCTION public.bootstrap_orgao IS 'Phase 2 onboarding RPC. Cria órgão (idempotente por CNPJ) + linka usuário autenticado em licitagov.usuarios. SECURITY DEFINER pra escapar das limitações de SELECT cruzado durante o INSERT.';
COMMENT ON FUNCTION public.get_current_profile IS 'Retorna user+órgão atual em 1 query, sem fricção de RLS. SECURITY DEFINER lê licitagov diretamente.';
