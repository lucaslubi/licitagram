-- ============================================================
-- LICITAGOV: Knowledge Base (RAG) — corpus oficial
-- AGU 2024, PAM 14.133, Lei 14.133/2021, Acórdãos TCU, IN SEGES
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS licitagov.knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,            -- 'AGU-2024' | 'PAM-14133-pregao' | 'Lei-14133' | 'TCU-1875-2021'
  source_type TEXT NOT NULL CHECK (source_type IN (
    'lei', 'acordao_tcu', 'instrucao_normativa', 'modelo_agu',
    'modelo_pam', 'parecer_referencial', 'manual', 'orientacao'
  )),
  document_title TEXT NOT NULL,
  modalidade TEXT,                 -- 'pregao' | 'inexigibilidade' | 'concorrencia' | 'credenciamento' | etc.
  artefato_tipo TEXT,              -- 'dfd' | 'etp' | 'tr' | 'edital' | 'parecer' | 'mapa_riscos' | null
  section TEXT,                    -- 'art. 18 §1º' | 'Alínea d' | 'pág. 42' etc.
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  token_count INTEGER,
  embedding VECTOR(768),           -- Gemini text-embedding-004
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Rastreamento de frescor (CRÍTICO — referências legais envelhecem)
  source_url TEXT,                 -- URL oficial da fonte (Planalto, TCU, AGU, PNCP)
  data_publicacao DATE,            -- Data original de publicação do documento
  data_verificacao TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Última verificação de atualidade
  hash_conteudo TEXT,              -- SHA-256 do chunk_text pra detectar mudanças
  revogado_em TIMESTAMPTZ,         -- Preenchido se revogação detectada
  revogado_por TEXT,               -- 'Lei X/Y', 'Acórdão Z', etc.
  vigente BOOLEAN GENERATED ALWAYS AS (revogado_em IS NULL) STORED,

  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, chunk_index)
);

-- HNSW index para similarity search rápido (cosine)
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding
  ON licitagov.knowledge_base
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_knowledge_source ON licitagov.knowledge_base(source);
CREATE INDEX IF NOT EXISTS idx_knowledge_artefato ON licitagov.knowledge_base(artefato_tipo) WHERE artefato_tipo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_modalidade ON licitagov.knowledge_base(modalidade) WHERE modalidade IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_vigente ON licitagov.knowledge_base(vigente) WHERE vigente = TRUE;

-- ------------------------------------------------------------
-- Tabela de fontes oficiais com política de refresh
-- Worker semanal re-verifica url_fonte e atualiza data_verificacao
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS licitagov.knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,              -- 'TCU-Acordaos', 'Planalto-Lei-14133', 'AGU-Modelos'
  categoria TEXT NOT NULL,                -- 'lei' | 'acordao_tcu' | 'modelo_agu' | 'in_seges' | 'pncp'
  url_base TEXT NOT NULL,
  refresh_interval_days INTEGER NOT NULL DEFAULT 7,
  ultimo_refresh TIMESTAMPTZ,
  -- proximo_refresh calculado via VIEW (generated column com cast text→interval
  -- viola immutabilidade no Postgres).
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  notas TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE VIEW licitagov.v_knowledge_sources AS
SELECT
  s.*,
  s.ultimo_refresh + (s.refresh_interval_days * INTERVAL '1 day') AS proximo_refresh,
  CASE
    WHEN s.ultimo_refresh IS NULL THEN TRUE
    WHEN NOW() > s.ultimo_refresh + (s.refresh_interval_days * INTERVAL '1 day') THEN TRUE
    ELSE FALSE
  END AS refresh_devido
FROM licitagov.knowledge_sources s;

ALTER TABLE licitagov.knowledge_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_sources_select_all ON licitagov.knowledge_sources;
CREATE POLICY p_sources_select_all ON licitagov.knowledge_sources
  FOR SELECT TO authenticated USING (TRUE);

-- Seed das fontes oficiais que o worker deve monitorar
INSERT INTO licitagov.knowledge_sources (nome, categoria, url_base, refresh_interval_days, notas) VALUES
  ('Planalto-Lei-14133', 'lei', 'http://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/L14133.htm', 30, 'Lei 14.133/2021 consolidada com alterações'),
  ('TCU-Acordaos-Plenario', 'acordao_tcu', 'https://pesquisa.apps.tcu.gov.br', 7, 'Acórdãos do Plenário sobre licitações Lei 14.133'),
  ('AGU-Modelos', 'modelo_agu', 'https://www.gov.br/agu/pt-br/composicao/cgu/cgu/modelos-de-licitacoes-e-contratos', 30, 'Modelos AGU atualizados periodicamente'),
  ('SEGES-IN', 'instrucao_normativa', 'https://www.gov.br/compras/pt-br/assuntos/instrucoes-normativas', 14, 'Instruções Normativas SEGES/ME'),
  ('PNCP-Padrao', 'manual', 'https://pncp.gov.br/api/publicacao/documentos', 7, 'Manual de uso do PNCP')
ON CONFLICT (nome) DO UPDATE SET
  categoria = EXCLUDED.categoria,
  url_base = EXCLUDED.url_base,
  notas = EXCLUDED.notas;

-- RLS: corpus é público pros autenticados (não há dado sensível — referência legal oficial)
ALTER TABLE licitagov.knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_kb_select_all ON licitagov.knowledge_base;
CREATE POLICY p_kb_select_all ON licitagov.knowledge_base
  FOR SELECT TO authenticated USING (TRUE);

-- Ingestão só via service role (script local ou edge function com service_role_key)
-- Nenhuma policy de INSERT/UPDATE/DELETE pra authenticated → service_role bypassa RLS.

-- ------------------------------------------------------------
-- RPC: search_knowledge — top-K similar chunks
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_knowledge(
  p_query_embedding VECTOR(768),
  p_artefato_tipo TEXT DEFAULT NULL,
  p_modalidade TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 8
)
RETURNS TABLE (
  id UUID,
  source TEXT,
  source_type TEXT,
  document_title TEXT,
  section TEXT,
  chunk_text TEXT,
  modalidade TEXT,
  artefato_tipo TEXT,
  source_url TEXT,
  data_publicacao DATE,
  data_verificacao TIMESTAMPTZ,
  distance FLOAT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT
    k.id, k.source, k.source_type, k.document_title, k.section,
    k.chunk_text, k.modalidade, k.artefato_tipo,
    k.source_url, k.data_publicacao, k.data_verificacao,
    (k.embedding <=> p_query_embedding) AS distance
  FROM licitagov.knowledge_base k
  WHERE k.embedding IS NOT NULL
    AND k.vigente = TRUE                -- só conteúdo não-revogado
    AND (p_artefato_tipo IS NULL OR k.artefato_tipo = p_artefato_tipo OR k.artefato_tipo IS NULL)
    AND (p_modalidade IS NULL OR k.modalidade = p_modalidade OR k.modalidade IS NULL)
  ORDER BY k.embedding <=> p_query_embedding
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 8), 20))
$$;
GRANT EXECUTE ON FUNCTION public.search_knowledge(VECTOR(768), TEXT, TEXT, INTEGER) TO authenticated;

-- ------------------------------------------------------------
-- RPC: knowledge_stats — visão rápida do corpus
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.knowledge_stats()
RETURNS TABLE (
  source TEXT,
  source_type TEXT,
  chunks BIGINT,
  vigentes BIGINT,
  revogados BIGINT,
  last_ingested TIMESTAMPTZ,
  last_verified TIMESTAMPTZ,
  age_days INTEGER,
  staleness TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT
    source,
    source_type,
    COUNT(*) AS chunks,
    COUNT(*) FILTER (WHERE vigente) AS vigentes,
    COUNT(*) FILTER (WHERE NOT vigente) AS revogados,
    MAX(criado_em) AS last_ingested,
    MAX(data_verificacao) AS last_verified,
    EXTRACT(DAY FROM NOW() - MAX(data_verificacao))::INTEGER AS age_days,
    CASE
      WHEN EXTRACT(DAY FROM NOW() - MAX(data_verificacao)) < 7 THEN 'fresh'
      WHEN EXTRACT(DAY FROM NOW() - MAX(data_verificacao)) < 30 THEN 'ok'
      WHEN EXTRACT(DAY FROM NOW() - MAX(data_verificacao)) < 90 THEN 'aging'
      ELSE 'stale'
    END AS staleness
  FROM licitagov.knowledge_base
  GROUP BY source, source_type
  ORDER BY MAX(data_verificacao) DESC
$$;
GRANT EXECUTE ON FUNCTION public.knowledge_stats() TO authenticated;

COMMENT ON TABLE licitagov.knowledge_base IS 'Corpus RAG: AGU, PAM, Lei 14.133, TCU, IN SEGES. Embeddings Gemini text-embedding-004 (768 dims).';
