-- ============================================================
-- LICITAGOV ↔ Compras.gov.br — dados oficiais
--
-- Espelhamos endpoints públicos do Compras.gov (gov.br/compras) em
-- tabelas próprias pra consulta rápida + RLS + joins com os dados
-- locais. Worker diário atualiza hash_conteudo e data_verificacao.
--
-- Compartilhamento B2B↔Gov: tabelas ficam em `licitagov.*` mas expomos
-- VIEWs `public.*` read-only pro B2B consumir nos widgets de
-- price-history sem duplicar pipeline.
-- ============================================================

-- ─── Catálogo oficial CATMAT (materiais) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS licitagov.cat_catmat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(20) NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  nome TEXT,
  sustentavel BOOLEAN DEFAULT FALSE,
  unidade_medida TEXT,
  pdm_codigo VARCHAR(20),
  pdm_nome TEXT,
  classe_codigo VARCHAR(20),
  classe_nome TEXT,
  grupo_codigo VARCHAR(20),
  grupo_nome TEXT,
  data_verificacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hash_conteudo TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_catmat_codigo ON licitagov.cat_catmat(codigo);
CREATE INDEX IF NOT EXISTS idx_catmat_descricao_trgm ON licitagov.cat_catmat USING gin (descricao gin_trgm_ops);

-- ─── Catálogo oficial CATSER (serviços) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS licitagov.cat_catser (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(20) NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  nome TEXT,
  unidade_medida TEXT,
  classe_codigo VARCHAR(20),
  classe_nome TEXT,
  grupo_codigo VARCHAR(20),
  grupo_nome TEXT,
  data_verificacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hash_conteudo TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_catser_codigo ON licitagov.cat_catser(codigo);
CREATE INDEX IF NOT EXISTS idx_catser_descricao_trgm ON licitagov.cat_catser USING gin (descricao gin_trgm_ops);

-- Habilita pg_trgm se ainda não (pra busca textual nos catálogos)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Painel de Preços oficial ────────────────────────────────────────────
-- Preços praticados por CATMAT/CATSER (fonte autoritativa Acórdão TCU 1.875)
CREATE TABLE IF NOT EXISTS licitagov.painel_precos_oficial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_item CHAR(1) NOT NULL CHECK (tipo_item IN ('M', 'S')), -- M=Material, S=Serviço
  codigo_item VARCHAR(20) NOT NULL,
  descricao TEXT,
  unidade_medida TEXT,
  orgao_cnpj VARCHAR(14),
  orgao_nome TEXT,
  uasg_codigo VARCHAR(10),
  uasg_nome TEXT,
  modalidade TEXT,
  numero_compra TEXT,
  ano_compra INTEGER,
  data_homologacao DATE,
  quantidade NUMERIC,
  valor_unitario NUMERIC NOT NULL,
  valor_total NUMERIC,
  fornecedor_cnpj VARCHAR(14),
  fornecedor_nome TEXT,
  fonte_url TEXT,
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  hash_conteudo TEXT UNIQUE,
  data_verificacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_painel_codigo ON licitagov.painel_precos_oficial(tipo_item, codigo_item);
CREATE INDEX IF NOT EXISTS idx_painel_data ON licitagov.painel_precos_oficial(data_homologacao DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_painel_desc_trgm ON licitagov.painel_precos_oficial USING gin (descricao gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_painel_modalidade ON licitagov.painel_precos_oficial(modalidade) WHERE modalidade IS NOT NULL;

-- ─── Fornecedores (Gov.br) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS licitagov.fornecedores_gov (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj VARCHAR(14) NOT NULL UNIQUE,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  uf CHAR(2),
  municipio TEXT,
  cnae_primario VARCHAR(10),
  porte TEXT,                                         -- ME/EPP/Demais
  situacao_cadastral TEXT,                            -- Ativo/Inativo/Suspenso
  possui_sancao BOOLEAN NOT NULL DEFAULT FALSE,
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  hash_conteudo TEXT,
  data_verificacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_forn_cnpj ON licitagov.fornecedores_gov(cnpj);
CREATE INDEX IF NOT EXISTS idx_forn_razao_trgm ON licitagov.fornecedores_gov USING gin (razao_social gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_forn_uf ON licitagov.fornecedores_gov(uf);
CREATE INDEX IF NOT EXISTS idx_forn_cnae ON licitagov.fornecedores_gov(cnae_primario);

-- ─── Sanções ativas ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS licitagov.sancoes_fornecedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj VARCHAR(14) NOT NULL,
  tipo TEXT NOT NULL,                                 -- Impedimento / Inidoneidade / Suspensão
  orgao_sancionador TEXT,
  data_inicio DATE,
  data_fim DATE,
  fonte TEXT,                                         -- CGU/CEIS, TCU, órgão
  descricao TEXT,
  hash_conteudo TEXT UNIQUE,
  data_verificacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sancao_cnpj ON licitagov.sancoes_fornecedor(cnpj);
CREATE INDEX IF NOT EXISTS idx_sancao_vigente ON licitagov.sancoes_fornecedor(cnpj)
  WHERE data_fim IS NULL OR data_fim >= CURRENT_DATE;

-- ─── RLS: corpus de referência é público pros autenticados ───────────────
ALTER TABLE licitagov.cat_catmat ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.cat_catser ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.painel_precos_oficial ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.fornecedores_gov ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.sancoes_fornecedor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_catmat_read ON licitagov.cat_catmat;
CREATE POLICY p_catmat_read ON licitagov.cat_catmat FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS p_catser_read ON licitagov.cat_catser;
CREATE POLICY p_catser_read ON licitagov.cat_catser FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS p_painel_read ON licitagov.painel_precos_oficial;
CREATE POLICY p_painel_read ON licitagov.painel_precos_oficial FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS p_forn_read ON licitagov.fornecedores_gov;
CREATE POLICY p_forn_read ON licitagov.fornecedores_gov FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS p_sancao_read ON licitagov.sancoes_fornecedor;
CREATE POLICY p_sancao_read ON licitagov.sancoes_fornecedor FOR SELECT TO authenticated USING (TRUE);

-- ─── VIEWs públicas pro B2B (apps/web) consumir sem cross-schema RPC ─────
CREATE OR REPLACE VIEW public.v_painel_precos_oficial AS
  SELECT * FROM licitagov.painel_precos_oficial;

CREATE OR REPLACE VIEW public.v_catmat AS SELECT * FROM licitagov.cat_catmat;
CREATE OR REPLACE VIEW public.v_catser AS SELECT * FROM licitagov.cat_catser;
CREATE OR REPLACE VIEW public.v_fornecedores_gov AS SELECT * FROM licitagov.fornecedores_gov;
CREATE OR REPLACE VIEW public.v_sancoes_fornecedor AS SELECT * FROM licitagov.sancoes_fornecedor;

GRANT SELECT ON public.v_painel_precos_oficial TO authenticated;
GRANT SELECT ON public.v_catmat TO authenticated;
GRANT SELECT ON public.v_catser TO authenticated;
GRANT SELECT ON public.v_fornecedores_gov TO authenticated;
GRANT SELECT ON public.v_sancoes_fornecedor TO authenticated;

-- ============================================================
-- RPCs canônicas — consumidas por Gov e B2B
-- ============================================================

-- buscar_preco_painel_oficial: retorna amostra de preços oficiais
CREATE OR REPLACE FUNCTION public.buscar_preco_painel_oficial(
  p_query TEXT,
  p_codigo VARCHAR(20) DEFAULT NULL,
  p_tipo CHAR(1) DEFAULT NULL,          -- 'M' | 'S' | NULL=ambos
  p_modalidade TEXT DEFAULT NULL,
  p_meses INTEGER DEFAULT 12,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  tipo_item CHAR(1),
  codigo_item VARCHAR(20),
  descricao TEXT,
  unidade_medida TEXT,
  orgao_nome TEXT,
  uasg_nome TEXT,
  modalidade TEXT,
  data_homologacao DATE,
  valor_unitario NUMERIC,
  fornecedor_nome TEXT,
  fonte_url TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $function$
  SELECT
    p.id, p.tipo_item, p.codigo_item, p.descricao, p.unidade_medida,
    p.orgao_nome, p.uasg_nome, p.modalidade, p.data_homologacao,
    p.valor_unitario, p.fornecedor_nome, p.fonte_url
  FROM licitagov.painel_precos_oficial p
  WHERE
    (p_codigo IS NULL OR p.codigo_item = p_codigo)
    AND (p_tipo IS NULL OR p.tipo_item = p_tipo)
    AND (p_modalidade IS NULL OR p.modalidade ILIKE '%' || p_modalidade || '%')
    AND (
      p_query IS NULL
      OR p.descricao ILIKE '%' || p_query || '%'
      OR p.descricao % p_query
    )
    AND (p_meses IS NULL OR p.data_homologacao >= CURRENT_DATE - (GREATEST(1, LEAST(p_meses, 60)) || ' months')::interval)
    AND p.valor_unitario > 0
  ORDER BY
    (p.descricao % COALESCE(p_query, '')) DESC,
    p.data_homologacao DESC NULLS LAST
  LIMIT GREATEST(5, LEAST(COALESCE(p_limit, 50), 500))
$function$;
GRANT EXECUTE ON FUNCTION public.buscar_preco_painel_oficial(TEXT, VARCHAR(20), CHAR(1), TEXT, INTEGER, INTEGER) TO authenticated;

-- stats_painel_oficial: média, mediana, CV da amostra oficial
CREATE OR REPLACE FUNCTION public.stats_painel_oficial(
  p_query TEXT,
  p_codigo VARCHAR(20) DEFAULT NULL,
  p_tipo CHAR(1) DEFAULT NULL,
  p_meses INTEGER DEFAULT 12
)
RETURNS TABLE (
  n INTEGER,
  media NUMERIC,
  mediana NUMERIC,
  minimo NUMERIC,
  maximo NUMERIC,
  cv NUMERIC,
  compliance_tcu_1875 BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $function$
  WITH amostra AS (
    SELECT p.valor_unitario AS v
    FROM licitagov.painel_precos_oficial p
    WHERE (p_codigo IS NULL OR p.codigo_item = p_codigo)
      AND (p_tipo IS NULL OR p.tipo_item = p_tipo)
      AND (p_query IS NULL OR p.descricao ILIKE '%' || p_query || '%')
      AND p.valor_unitario > 0
      AND (p_meses IS NULL OR p.data_homologacao >= CURRENT_DATE - (GREATEST(1, LEAST(p_meses, 60)) || ' months')::interval)
    ORDER BY p.valor_unitario
    LIMIT 1000
  )
  SELECT
    COUNT(*)::INTEGER,
    ROUND(AVG(v)::numeric, 2),
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v)::numeric, 2),
    ROUND(MIN(v)::numeric, 2),
    ROUND(MAX(v)::numeric, 2),
    ROUND(CASE WHEN AVG(v) > 0 THEN (STDDEV_SAMP(v) / AVG(v) * 100)::numeric ELSE 0 END, 2),
    (COUNT(*) >= 3 AND CASE WHEN AVG(v) > 0 THEN STDDEV_SAMP(v) / AVG(v) * 100 ELSE 100 END < 25)
  FROM amostra
$function$;
GRANT EXECUTE ON FUNCTION public.stats_painel_oficial(TEXT, VARCHAR(20), CHAR(1), INTEGER) TO authenticated;

-- search_catmat: autocomplete do catálogo oficial
CREATE OR REPLACE FUNCTION public.search_catmat_catser(
  p_query TEXT,
  p_tipo CHAR(1) DEFAULT NULL,
  p_limit INTEGER DEFAULT 30
)
RETURNS TABLE (
  tipo CHAR(1),
  codigo VARCHAR(20),
  descricao TEXT,
  unidade_medida TEXT,
  categoria TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $function$
  (SELECT 'M'::CHAR(1) AS tipo, codigo, descricao, unidade_medida, pdm_nome AS categoria
   FROM licitagov.cat_catmat
   WHERE (p_tipo IS NULL OR p_tipo = 'M')
     AND (p_query IS NULL OR descricao ILIKE '%' || p_query || '%' OR codigo = p_query)
   ORDER BY (descricao <-> COALESCE(p_query, '')) ASC
   LIMIT GREATEST(5, LEAST(COALESCE(p_limit, 30), 100)))
  UNION ALL
  (SELECT 'S'::CHAR(1) AS tipo, codigo, descricao, unidade_medida, grupo_nome AS categoria
   FROM licitagov.cat_catser
   WHERE (p_tipo IS NULL OR p_tipo = 'S')
     AND (p_query IS NULL OR descricao ILIKE '%' || p_query || '%' OR codigo = p_query)
   ORDER BY (descricao <-> COALESCE(p_query, '')) ASC
   LIMIT GREATEST(5, LEAST(COALESCE(p_limit, 30), 100)))
$function$;
GRANT EXECUTE ON FUNCTION public.search_catmat_catser(TEXT, CHAR(1), INTEGER) TO authenticated;

-- recomendar_fornecedores: top fornecedores por CNAE/UF com flag de sanção
CREATE OR REPLACE FUNCTION public.recomendar_fornecedores(
  p_cnae TEXT DEFAULT NULL,
  p_uf CHAR(2) DEFAULT NULL,
  p_query TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  cnpj VARCHAR(14),
  razao_social TEXT,
  uf CHAR(2),
  municipio TEXT,
  porte TEXT,
  cnae_primario VARCHAR(10),
  situacao_cadastral TEXT,
  possui_sancao BOOLEAN,
  sancoes_vigentes INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $function$
  SELECT
    f.cnpj, f.razao_social, f.uf, f.municipio, f.porte,
    f.cnae_primario, f.situacao_cadastral, f.possui_sancao,
    (SELECT COUNT(*)::INTEGER FROM licitagov.sancoes_fornecedor s
     WHERE s.cnpj = f.cnpj
       AND (s.data_fim IS NULL OR s.data_fim >= CURRENT_DATE)) AS sancoes_vigentes
  FROM licitagov.fornecedores_gov f
  WHERE (p_cnae IS NULL OR f.cnae_primario LIKE p_cnae || '%')
    AND (p_uf IS NULL OR f.uf = p_uf)
    AND (p_query IS NULL OR f.razao_social ILIKE '%' || p_query || '%' OR f.cnpj = p_query)
    AND COALESCE(f.situacao_cadastral, 'Ativo') = 'Ativo'
  ORDER BY f.possui_sancao ASC, f.razao_social
  LIMIT GREATEST(5, LEAST(COALESCE(p_limit, 20), 200))
$function$;
GRANT EXECUTE ON FUNCTION public.recomendar_fornecedores(TEXT, CHAR(2), TEXT, INTEGER) TO authenticated;

-- verificar_sancao: pra usar no Compliance Engine ANTES de publicar
CREATE OR REPLACE FUNCTION public.verificar_sancao_fornecedor(p_cnpj VARCHAR(14))
RETURNS TABLE (
  tem_sancao_vigente BOOLEAN,
  total INTEGER,
  tipos TEXT[]
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $function$
  SELECT
    COUNT(*) > 0,
    COUNT(*)::INTEGER,
    ARRAY_AGG(DISTINCT tipo)
  FROM licitagov.sancoes_fornecedor
  WHERE cnpj = p_cnpj
    AND (data_fim IS NULL OR data_fim >= CURRENT_DATE)
$function$;
GRANT EXECUTE ON FUNCTION public.verificar_sancao_fornecedor(VARCHAR(14)) TO authenticated;

-- ingest_painel_preco: INSERT idempotente via hash (chamado pelo worker)
CREATE OR REPLACE FUNCTION public.ingest_painel_preco(p_data JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $function$
DECLARE
  v_hash TEXT;
  v_id UUID;
BEGIN
  v_hash := encode(digest(p_data::text, 'sha256'), 'hex');
  INSERT INTO licitagov.painel_precos_oficial (
    tipo_item, codigo_item, descricao, unidade_medida,
    orgao_cnpj, orgao_nome, uasg_codigo, uasg_nome,
    modalidade, numero_compra, ano_compra, data_homologacao,
    quantidade, valor_unitario, valor_total,
    fornecedor_cnpj, fornecedor_nome, fonte_url,
    metadados, hash_conteudo
  ) VALUES (
    (p_data->>'tipo_item')::CHAR(1),
    p_data->>'codigo_item',
    p_data->>'descricao',
    p_data->>'unidade_medida',
    p_data->>'orgao_cnpj',
    p_data->>'orgao_nome',
    p_data->>'uasg_codigo',
    p_data->>'uasg_nome',
    p_data->>'modalidade',
    p_data->>'numero_compra',
    NULLIF(p_data->>'ano_compra','')::INTEGER,
    NULLIF(p_data->>'data_homologacao','')::DATE,
    NULLIF(p_data->>'quantidade','')::NUMERIC,
    (p_data->>'valor_unitario')::NUMERIC,
    NULLIF(p_data->>'valor_total','')::NUMERIC,
    p_data->>'fornecedor_cnpj',
    p_data->>'fornecedor_nome',
    p_data->>'fonte_url',
    COALESCE(p_data->'metadados', '{}'::jsonb),
    v_hash
  )
  ON CONFLICT (hash_conteudo) DO UPDATE SET data_verificacao = NOW()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.ingest_painel_preco(JSONB) TO service_role;

COMMENT ON TABLE licitagov.painel_precos_oficial IS
  'Preços praticados oficiais (Compras.gov.br). Fonte canônica Acórdão TCU 1.875/2021.';
COMMENT ON TABLE licitagov.fornecedores_gov IS
  'Fornecedores cadastrados no Compras.gov.br. Usado pra recomendar e bloquear sancionados.';
