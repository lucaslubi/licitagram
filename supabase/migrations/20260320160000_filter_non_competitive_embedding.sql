-- Filter non-competitive modalities from semantic recall
-- Inexigibilidade (9), Credenciamento (12), Inaplicabilidade (14)
-- These should never generate matches or notifications

-- Drop first because we're adding modalidade_id to the return type
DROP FUNCTION IF EXISTS match_tenders_by_embedding(vector, double precision, integer);

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
  modalidade_id integer,
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
    t.modalidade_id,
    t.valor_estimado,
    t.data_abertura,
    t.data_encerramento,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM public.tenders t
  WHERE t.embedding IS NOT NULL
    AND t.status IN ('analyzing', 'analyzed')
    AND (t.data_encerramento IS NULL OR t.data_encerramento >= now())
    AND 1 - (t.embedding <=> query_embedding) >= similarity_threshold
    AND (t.modalidade_id IS NULL OR t.modalidade_id NOT IN (9, 12, 14))
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
