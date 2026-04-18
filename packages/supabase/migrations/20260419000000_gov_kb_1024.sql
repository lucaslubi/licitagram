-- ============================================================
-- LICITAGOV: migração knowledge_base VECTOR(768) → VECTOR(1024)
-- Motivo: troca do embedding provider pra multilingual-e5-large
--         (self-host TEI no VPS Hostinger, 1024 dims).
-- Nota:   embeddings antigos (768d) incompatíveis; tabela reconstruída.
--         Re-ingestão do corpus é executada via pnpm ingest:gov.
-- ============================================================

-- Drop índice HNSW que depende da coluna
DROP INDEX IF EXISTS licitagov.idx_knowledge_embedding;

-- Drop RPCs que referenciam VECTOR(768)
DROP FUNCTION IF EXISTS public.search_knowledge(VECTOR(768), TEXT, TEXT, INTEGER);

-- Trunca conteúdo (chunks antigos em 768d não são compatíveis)
TRUNCATE TABLE licitagov.knowledge_base;

-- Altera dimensão
ALTER TABLE licitagov.knowledge_base
  ALTER COLUMN embedding TYPE VECTOR(1024);

-- Recria índice HNSW com nova dimensão
CREATE INDEX idx_knowledge_embedding
  ON licitagov.knowledge_base
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Recria RPC search_knowledge com VECTOR(1024)
CREATE OR REPLACE FUNCTION public.search_knowledge(
  p_query_embedding VECTOR(1024),
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
    AND k.vigente = TRUE
    AND (p_artefato_tipo IS NULL OR k.artefato_tipo = p_artefato_tipo OR k.artefato_tipo IS NULL)
    AND (p_modalidade IS NULL OR k.modalidade = p_modalidade OR k.modalidade IS NULL)
  ORDER BY k.embedding <=> p_query_embedding
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 8), 20))
$$;
GRANT EXECUTE ON FUNCTION public.search_knowledge(VECTOR(1024), TEXT, TEXT, INTEGER) TO authenticated;

COMMENT ON COLUMN licitagov.knowledge_base.embedding IS
  'multilingual-e5-large (1024 dims) via TEI self-host em 85.31.60.53:8081. Fallback Gemini.';
