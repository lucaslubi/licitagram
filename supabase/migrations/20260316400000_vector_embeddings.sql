-- ============================================================
-- VECTOR EMBEDDINGS: Semantic Matching Infrastructure
-- ============================================================
-- Adds pgvector extension, embedding columns on tenders and
-- companies, HNSW indexes for fast cosine similarity, and a
-- match function used by the semantic matcher processor.
-- ============================================================

-- 1. Enable pgvector (Supabase has it pre-installed)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add embedding columns (1024 dimensions — Jina v3 default)
ALTER TABLE public.tenders
  ADD COLUMN IF NOT EXISTS embedding vector(1024),
  ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS embedding vector(1024),
  ADD COLUMN IF NOT EXISTS company_profile_text TEXT,
  ADD COLUMN IF NOT EXISTS profiled_at TIMESTAMPTZ;

-- 3. HNSW indexes for fast approximate nearest-neighbor search
-- ef_construction=128 gives good recall/build tradeoff; m=16 is standard
CREATE INDEX IF NOT EXISTS idx_tenders_embedding_hnsw
  ON public.tenders
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

CREATE INDEX IF NOT EXISTS idx_companies_embedding_hnsw
  ON public.companies
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

-- 4. Function: find tenders similar to a company embedding
-- Returns tenders sorted by cosine similarity (1 - distance)
CREATE OR REPLACE FUNCTION match_tenders_by_embedding(
  query_embedding vector(1024),
  similarity_threshold float DEFAULT 0.45,
  match_count int DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  objeto text,
  orgao_nome text,
  uf char(2),
  modalidade_nome text,
  valor_estimado numeric,
  data_abertura timestamptz,
  data_encerramento timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.objeto,
    t.orgao_nome,
    t.uf,
    t.modalidade_nome,
    t.valor_estimado,
    t.data_abertura,
    t.data_encerramento,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM public.tenders t
  WHERE t.embedding IS NOT NULL
    AND t.status IN ('analyzing', 'analyzed')
    AND (t.data_encerramento IS NULL OR t.data_encerramento >= now())
    AND 1 - (t.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 5. Add match_source 'semantic' to matches if not already allowed
-- (match_source is a text column with no CHECK constraint — just documenting)
COMMENT ON COLUMN public.tenders.embedding IS 'Jina v3 1024-dim embedding of objeto + resumo + requisitos';
COMMENT ON COLUMN public.companies.embedding IS 'Jina v3 1024-dim embedding of expanded company profile';
COMMENT ON COLUMN public.companies.company_profile_text IS 'Expanded text profile used to generate embedding';
