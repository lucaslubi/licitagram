-- ============================================================
-- LICITAGOV: Logomarca do órgão pra sair nos PDFs gerados
-- ============================================================

-- Coluna opcional em licitagov.orgaos
ALTER TABLE licitagov.orgaos
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN licitagov.orgaos.logo_url IS
  'URL pública da logomarca do órgão. Renderizada no cabeçalho dos PDFs.';

-- Bucket público pra logos (pequenos, acesso anônimo ok — pública do órgão)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('orgao-logos', 'orgao-logos', true, 2097152, ARRAY['image/png','image/jpeg','image/webp','image/svg+xml'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies: admin/coordenador do órgão pode uploadar e deletar a própria logo
DROP POLICY IF EXISTS p_storage_logo_select ON storage.objects;
CREATE POLICY p_storage_logo_select ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'orgao-logos');

DROP POLICY IF EXISTS p_storage_logo_insert ON storage.objects;
CREATE POLICY p_storage_logo_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'orgao-logos'
    AND (storage.foldername(name))[1] = licitagov.current_orgao_id()::text
    AND licitagov.current_user_is_admin()
  );

DROP POLICY IF EXISTS p_storage_logo_update ON storage.objects;
CREATE POLICY p_storage_logo_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'orgao-logos'
    AND (storage.foldername(name))[1] = licitagov.current_orgao_id()::text
    AND licitagov.current_user_is_admin()
  );

DROP POLICY IF EXISTS p_storage_logo_delete ON storage.objects;
CREATE POLICY p_storage_logo_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'orgao-logos'
    AND (storage.foldername(name))[1] = licitagov.current_orgao_id()::text
    AND licitagov.current_user_is_admin()
  );

-- RPC pra atualizar apenas a logo do órgão (admin/coordenador)
CREATE OR REPLACE FUNCTION public.update_orgao_logo(p_logo_url TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $function$
DECLARE
  v_orgao_id UUID := licitagov.current_orgao_id();
BEGIN
  IF v_orgao_id IS NULL THEN RAISE EXCEPTION 'sem órgão'; END IF;
  IF NOT licitagov.current_user_is_admin() THEN
    RAISE EXCEPTION 'apenas admin/coordenador pode alterar a logomarca';
  END IF;

  UPDATE licitagov.orgaos
  SET logo_url = p_logo_url,
      atualizado_em = NOW()
  WHERE id = v_orgao_id;

  RETURN FOUND;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.update_orgao_logo(TEXT) TO authenticated;

-- Atualiza get_current_profile pra incluir a logo_url
-- (redeclara mantendo os outros campos; ajustar se schema já tem)
DROP FUNCTION IF EXISTS public.get_current_profile();

CREATE OR REPLACE FUNCTION public.get_current_profile()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  nome_completo TEXT,
  cargo TEXT,
  papel TEXT,
  mfa_habilitado BOOLEAN,
  onboarded_at TIMESTAMPTZ,
  orgao_id UUID,
  orgao_cnpj TEXT,
  orgao_razao_social TEXT,
  orgao_nome_fantasia TEXT,
  orgao_esfera TEXT,
  orgao_uf TEXT,
  orgao_municipio TEXT,
  orgao_logo_url TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $function$
  SELECT
    u.id, u.email, u.nome_completo, u.cargo, u.papel, u.mfa_habilitado, u.criado_em,
    o.id, o.cnpj, o.razao_social, o.nome_fantasia, o.esfera, o.uf, o.municipio,
    o.logo_url
  FROM licitagov.usuarios u
  JOIN licitagov.orgaos o ON o.id = u.orgao_id
  WHERE u.id = auth.uid()
$function$;
GRANT EXECUTE ON FUNCTION public.get_current_profile() TO authenticated;
