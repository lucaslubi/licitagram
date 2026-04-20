-- ============================================================
-- LICITAGOV ↔ Compras.gov.br — UASG + Órgãos Oficiais
--
-- Complementa 20260419050000_gov_compras_gov_sync.sql cobrindo:
--   - licitagov.uasg_oficial      (Unidades Administrativas de Serviços Gerais)
--   - licitagov.orgaos_oficiais   (cadastro SIORG/SIASG)
--
-- Fonte: https://dadosabertos.compras.gov.br
--   - GET /modulo-uasg/1_consultarUasg
--   - GET /modulo-uasg/2_consultarOrgao
--
-- Uso (enrichment):
--   - painel_precos_oficial.uasg_codigo → JOIN uasg_oficial.codigo
--   - processos locais com UASG → JOIN pra normalizar nome + esfera
--   - VIEWs públicas pro B2B usar via public.v_uasg / public.v_orgaos_oficiais
-- ============================================================

-- ─── UASG (Unidade Administrativa de Serviços Gerais) ─────────────────────
CREATE TABLE IF NOT EXISTS licitagov.uasg_oficial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(10) NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  nome_resumido TEXT,
  cnpj VARCHAR(14),
  orgao_cnpj VARCHAR(14),
  orgao_nome TEXT,
  orgao_superior_cnpj VARCHAR(14),
  orgao_superior_nome TEXT,
  uf CHAR(2),
  municipio TEXT,
  municipio_ibge VARCHAR(7),
  uso_sisg BOOLEAN,
  ativo BOOLEAN DEFAULT TRUE,
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  hash_conteudo TEXT,
  data_verificacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_uasg_codigo ON licitagov.uasg_oficial(codigo);
CREATE INDEX IF NOT EXISTS idx_uasg_cnpj ON licitagov.uasg_oficial(cnpj);
CREATE INDEX IF NOT EXISTS idx_uasg_orgao_cnpj ON licitagov.uasg_oficial(orgao_cnpj);
CREATE INDEX IF NOT EXISTS idx_uasg_uf ON licitagov.uasg_oficial(uf);
CREATE INDEX IF NOT EXISTS idx_uasg_nome_trgm ON licitagov.uasg_oficial USING gin (nome gin_trgm_ops);

-- ─── Órgãos Oficiais (SIORG) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS licitagov.orgaos_oficiais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj VARCHAR(14) NOT NULL UNIQUE,
  razao_social TEXT NOT NULL,
  nome_resumido TEXT,
  sigla TEXT,
  esfera VARCHAR(10) CHECK (esfera IN ('federal', 'estadual', 'municipal', 'distrital')),
  poder VARCHAR(20) CHECK (poder IN ('executivo', 'legislativo', 'judiciario', 'autonomo')),
  orgao_superior_cnpj VARCHAR(14),
  orgao_superior_nome TEXT,
  uf CHAR(2),
  municipio TEXT,
  municipio_ibge VARCHAR(7),
  codigo_siorg VARCHAR(20),
  natureza_juridica VARCHAR(4),
  ativo BOOLEAN DEFAULT TRUE,
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  hash_conteudo TEXT,
  data_verificacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orgaos_cnpj ON licitagov.orgaos_oficiais(cnpj);
CREATE INDEX IF NOT EXISTS idx_orgaos_esfera ON licitagov.orgaos_oficiais(esfera);
CREATE INDEX IF NOT EXISTS idx_orgaos_uf ON licitagov.orgaos_oficiais(uf);
CREATE INDEX IF NOT EXISTS idx_orgaos_superior ON licitagov.orgaos_oficiais(orgao_superior_cnpj);
CREATE INDEX IF NOT EXISTS idx_orgaos_razao_trgm ON licitagov.orgaos_oficiais USING gin (razao_social gin_trgm_ops);

-- ─── RLS (read-only público via VIEW) ─────────────────────────────────────
ALTER TABLE licitagov.uasg_oficial ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.orgaos_oficiais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uasg_read_all ON licitagov.uasg_oficial;
CREATE POLICY uasg_read_all ON licitagov.uasg_oficial FOR SELECT USING (true);

DROP POLICY IF EXISTS orgaos_oficiais_read_all ON licitagov.orgaos_oficiais;
CREATE POLICY orgaos_oficiais_read_all ON licitagov.orgaos_oficiais FOR SELECT USING (true);

GRANT SELECT ON licitagov.uasg_oficial TO authenticated, anon;
GRANT SELECT ON licitagov.orgaos_oficiais TO authenticated, anon;

-- ─── VIEWs públicas (B2B consome via public.*) ────────────────────────────
CREATE OR REPLACE VIEW public.v_uasg AS
  SELECT codigo, nome, nome_resumido, cnpj, orgao_cnpj, orgao_nome,
         orgao_superior_cnpj, orgao_superior_nome, uf, municipio,
         municipio_ibge, uso_sisg, ativo, data_verificacao
  FROM licitagov.uasg_oficial
  WHERE ativo = TRUE;

CREATE OR REPLACE VIEW public.v_orgaos_oficiais AS
  SELECT cnpj, razao_social, nome_resumido, sigla, esfera, poder,
         orgao_superior_cnpj, orgao_superior_nome, uf, municipio,
         municipio_ibge, codigo_siorg, ativo, data_verificacao
  FROM licitagov.orgaos_oficiais
  WHERE ativo = TRUE;

GRANT SELECT ON public.v_uasg TO authenticated, anon;
GRANT SELECT ON public.v_orgaos_oficiais TO authenticated, anon;

-- ─── RPCs de busca ─────────────────────────────────────────────────────────

-- Busca UASG por código OU por nome (trigram) OU por órgão CNPJ
CREATE OR REPLACE FUNCTION licitagov.buscar_uasg(
  p_query TEXT DEFAULT NULL,
  p_codigo TEXT DEFAULT NULL,
  p_orgao_cnpj TEXT DEFAULT NULL,
  p_uf TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
  codigo TEXT,
  nome TEXT,
  cnpj TEXT,
  orgao_cnpj TEXT,
  orgao_nome TEXT,
  orgao_superior_nome TEXT,
  uf TEXT,
  municipio TEXT,
  uso_sisg BOOLEAN,
  similaridade REAL
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.codigo::TEXT,
         u.nome::TEXT,
         u.cnpj::TEXT,
         u.orgao_cnpj::TEXT,
         u.orgao_nome::TEXT,
         u.orgao_superior_nome::TEXT,
         u.uf::TEXT,
         u.municipio::TEXT,
         u.uso_sisg,
         CASE
           WHEN p_query IS NULL THEN 0
           ELSE similarity(u.nome, p_query)
         END AS similaridade
  FROM licitagov.uasg_oficial u
  WHERE u.ativo = TRUE
    AND (p_codigo IS NULL OR u.codigo = p_codigo)
    AND (p_orgao_cnpj IS NULL OR u.orgao_cnpj = p_orgao_cnpj)
    AND (p_uf IS NULL OR u.uf = upper(p_uf))
    AND (p_query IS NULL OR u.nome ILIKE '%' || p_query || '%' OR similarity(u.nome, p_query) > 0.15)
  ORDER BY similaridade DESC, u.nome
  LIMIT LEAST(p_limit, 200);
$$;

-- Busca órgão oficial por CNPJ OU por razão social
CREATE OR REPLACE FUNCTION licitagov.buscar_orgao_oficial(
  p_query TEXT DEFAULT NULL,
  p_cnpj TEXT DEFAULT NULL,
  p_esfera TEXT DEFAULT NULL,
  p_uf TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
  cnpj TEXT,
  razao_social TEXT,
  sigla TEXT,
  esfera TEXT,
  poder TEXT,
  orgao_superior_nome TEXT,
  uf TEXT,
  municipio TEXT,
  similaridade REAL
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.cnpj::TEXT,
         o.razao_social::TEXT,
         o.sigla::TEXT,
         o.esfera::TEXT,
         o.poder::TEXT,
         o.orgao_superior_nome::TEXT,
         o.uf::TEXT,
         o.municipio::TEXT,
         CASE
           WHEN p_query IS NULL THEN 0
           ELSE similarity(o.razao_social, p_query)
         END AS similaridade
  FROM licitagov.orgaos_oficiais o
  WHERE o.ativo = TRUE
    AND (p_cnpj IS NULL OR o.cnpj = p_cnpj)
    AND (p_esfera IS NULL OR o.esfera = p_esfera)
    AND (p_uf IS NULL OR o.uf = upper(p_uf))
    AND (p_query IS NULL OR o.razao_social ILIKE '%' || p_query || '%' OR similarity(o.razao_social, p_query) > 0.15)
  ORDER BY similaridade DESC, o.razao_social
  LIMIT LEAST(p_limit, 200);
$$;

GRANT EXECUTE ON FUNCTION licitagov.buscar_uasg(TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION licitagov.buscar_orgao_oficial(TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated, anon;

-- Reflexa no schema público pra PostgREST pegar
CREATE OR REPLACE FUNCTION public.buscar_uasg(
  p_query TEXT DEFAULT NULL,
  p_codigo TEXT DEFAULT NULL,
  p_orgao_cnpj TEXT DEFAULT NULL,
  p_uf TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
  codigo TEXT, nome TEXT, cnpj TEXT, orgao_cnpj TEXT, orgao_nome TEXT,
  orgao_superior_nome TEXT, uf TEXT, municipio TEXT, uso_sisg BOOLEAN, similaridade REAL
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM licitagov.buscar_uasg(p_query, p_codigo, p_orgao_cnpj, p_uf, p_limit);
$$;

CREATE OR REPLACE FUNCTION public.buscar_orgao_oficial(
  p_query TEXT DEFAULT NULL,
  p_cnpj TEXT DEFAULT NULL,
  p_esfera TEXT DEFAULT NULL,
  p_uf TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
  cnpj TEXT, razao_social TEXT, sigla TEXT, esfera TEXT, poder TEXT,
  orgao_superior_nome TEXT, uf TEXT, municipio TEXT, similaridade REAL
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM licitagov.buscar_orgao_oficial(p_query, p_cnpj, p_esfera, p_uf, p_limit);
$$;

GRANT EXECUTE ON FUNCTION public.buscar_uasg(TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.buscar_orgao_oficial(TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated, anon;

-- ─── Enrichment: JOIN pra resolver uasg_nome/orgao_nome no painel ─────────
-- Helper pra preencher campos faltantes no painel_precos_oficial usando
-- o cadastro oficial. Útil quando o Painel devolve só codigoUasg sem nome.
CREATE OR REPLACE FUNCTION licitagov.enrich_painel_with_uasg()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE licitagov.painel_precos_oficial p
  SET uasg_nome = COALESCE(p.uasg_nome, u.nome),
      orgao_cnpj = COALESCE(p.orgao_cnpj, u.orgao_cnpj),
      orgao_nome = COALESCE(p.orgao_nome, u.orgao_nome)
  FROM licitagov.uasg_oficial u
  WHERE p.uasg_codigo = u.codigo
    AND (p.uasg_nome IS NULL OR p.orgao_cnpj IS NULL OR p.orgao_nome IS NULL);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION licitagov.enrich_painel_with_uasg() TO service_role;

CREATE OR REPLACE FUNCTION public.enrich_painel_with_uasg()
RETURNS INTEGER
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT licitagov.enrich_painel_with_uasg();
$$;
GRANT EXECUTE ON FUNCTION public.enrich_painel_with_uasg() TO service_role;

COMMENT ON TABLE licitagov.uasg_oficial IS 'Cadastro oficial SIASG de UASGs (Compras.gov.br)';
COMMENT ON TABLE licitagov.orgaos_oficiais IS 'Cadastro oficial SIORG de órgãos públicos (Compras.gov.br)';
COMMENT ON FUNCTION licitagov.enrich_painel_with_uasg() IS 'Preenche nomes faltantes no painel_precos_oficial via JOIN com UASG oficial';
