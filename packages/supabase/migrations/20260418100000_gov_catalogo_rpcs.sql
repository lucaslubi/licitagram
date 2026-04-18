-- ============================================================
-- LICITAGOV: Catálogo normalizado — RPCs + RLS
-- ============================================================

ALTER TABLE licitagov.catalogo_normalizado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_catalogo_select_own ON licitagov.catalogo_normalizado;
CREATE POLICY p_catalogo_select_own ON licitagov.catalogo_normalizado
  FOR SELECT TO authenticated
  USING (orgao_id = licitagov.current_orgao_id() OR orgao_id IS NULL);

DROP POLICY IF EXISTS p_catalogo_write_admin ON licitagov.catalogo_normalizado;
CREATE POLICY p_catalogo_write_admin ON licitagov.catalogo_normalizado
  FOR ALL TO authenticated
  USING (licitagov.current_user_is_admin() AND orgao_id = licitagov.current_orgao_id())
  WITH CHECK (orgao_id = licitagov.current_orgao_id());

-- ------------------------------------------------------------
-- list_catalogo: lista itens do órgão (+ globais), com filtro textual
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_catalogo(
  p_query TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  codigo_catmat VARCHAR(20),
  codigo_catser VARCHAR(20),
  descricao_oficial TEXT,
  descricao_normalizada TEXT,
  unidade_medida VARCHAR(50),
  categoria TEXT,
  uso_count INTEGER,
  aliases TEXT[],
  criado_em TIMESTAMPTZ,
  scope TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT
    c.id, c.codigo_catmat, c.codigo_catser, c.descricao_oficial, c.descricao_normalizada,
    c.unidade_medida, c.categoria, c.uso_count, c.aliases, c.criado_em,
    CASE WHEN c.orgao_id IS NULL THEN 'global' ELSE 'orgao' END AS scope
  FROM licitagov.catalogo_normalizado c
  WHERE (c.orgao_id = licitagov.current_orgao_id() OR c.orgao_id IS NULL)
    AND (
      p_query IS NULL
      OR c.descricao_oficial ILIKE '%' || p_query || '%'
      OR c.descricao_normalizada ILIKE '%' || p_query || '%'
      OR c.codigo_catmat = p_query
      OR c.codigo_catser = p_query
      OR EXISTS (SELECT 1 FROM unnest(c.aliases) a WHERE a ILIKE '%' || p_query || '%')
    )
  ORDER BY c.uso_count DESC, c.criado_em DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
$$;
GRANT EXECUTE ON FUNCTION public.list_catalogo(TEXT, INTEGER) TO authenticated;

-- ------------------------------------------------------------
-- upsert_catalogo_item: admin adiciona ou atualiza item
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_catalogo_item(
  p_id UUID,
  p_codigo_catmat VARCHAR(20),
  p_codigo_catser VARCHAR(20),
  p_descricao_oficial TEXT,
  p_descricao_normalizada TEXT,
  p_unidade_medida VARCHAR(50),
  p_categoria TEXT,
  p_aliases TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
DECLARE
  v_orgao_id UUID := licitagov.current_orgao_id();
  v_id UUID;
BEGIN
  IF NOT licitagov.current_user_is_admin() THEN RAISE EXCEPTION 'apenas admin/coordenador'; END IF;
  IF p_descricao_oficial IS NULL OR length(trim(p_descricao_oficial)) < 3 THEN
    RAISE EXCEPTION 'descrição obrigatória';
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE licitagov.catalogo_normalizado
    SET codigo_catmat = p_codigo_catmat,
        codigo_catser = p_codigo_catser,
        descricao_oficial = p_descricao_oficial,
        descricao_normalizada = COALESCE(p_descricao_normalizada, lower(p_descricao_oficial)),
        unidade_medida = p_unidade_medida,
        categoria = p_categoria,
        aliases = COALESCE(p_aliases, '{}')
    WHERE id = p_id AND orgao_id = v_orgao_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'item não encontrado'; END IF;
  ELSE
    INSERT INTO licitagov.catalogo_normalizado (
      orgao_id, codigo_catmat, codigo_catser, descricao_oficial,
      descricao_normalizada, unidade_medida, categoria, aliases
    ) VALUES (
      v_orgao_id, p_codigo_catmat, p_codigo_catser, p_descricao_oficial,
      COALESCE(p_descricao_normalizada, lower(p_descricao_oficial)),
      p_unidade_medida, p_categoria, COALESCE(p_aliases, '{}')
    )
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_catalogo_item(UUID, VARCHAR(20), VARCHAR(20), TEXT, TEXT, VARCHAR(50), TEXT, TEXT[]) TO authenticated;

-- ------------------------------------------------------------
-- delete_catalogo_item
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_catalogo_item(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
BEGIN
  IF NOT licitagov.current_user_is_admin() THEN RAISE EXCEPTION 'apenas admin/coordenador'; END IF;
  DELETE FROM licitagov.catalogo_normalizado
  WHERE id = p_id AND orgao_id = licitagov.current_orgao_id();
  RETURN FOUND;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_catalogo_item(UUID) TO authenticated;

-- ------------------------------------------------------------
-- Storage bucket para PDFs de artefatos (drive)
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('artefatos-pdf', 'artefatos-pdf', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Policies: usuários do órgão leem e escrevem no próprio path (orgao_id/...)
DROP POLICY IF EXISTS p_storage_artefatos_select ON storage.objects;
CREATE POLICY p_storage_artefatos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'artefatos-pdf'
    AND (storage.foldername(name))[1] = licitagov.current_orgao_id()::text
  );

DROP POLICY IF EXISTS p_storage_artefatos_insert ON storage.objects;
CREATE POLICY p_storage_artefatos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'artefatos-pdf'
    AND (storage.foldername(name))[1] = licitagov.current_orgao_id()::text
  );

DROP POLICY IF EXISTS p_storage_artefatos_delete ON storage.objects;
CREATE POLICY p_storage_artefatos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'artefatos-pdf'
    AND (storage.foldername(name))[1] = licitagov.current_orgao_id()::text
    AND licitagov.current_user_is_admin()
  );

COMMENT ON TABLE licitagov.catalogo_normalizado IS 'Catálogo normalizado de itens por órgão + itens globais (orgao_id IS NULL).';
