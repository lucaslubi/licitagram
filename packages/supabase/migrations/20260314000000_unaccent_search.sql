-- Enable unaccent extension for accent-insensitive text search
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create an IMMUTABLE wrapper for unaccent (required for use in indexes)
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text AS $$
  SELECT public.unaccent('public.unaccent', $1)
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

-- Trigram index on unaccented+lowered objeto for fast ILIKE/LIKE searches
CREATE INDEX IF NOT EXISTS idx_tenders_objeto_unaccent_trgm
  ON public.tenders USING gin(
    (lower(public.immutable_unaccent(objeto))) gin_trgm_ops
  );

-- RPC function for accent-insensitive search on tenders.objeto
-- Accepts a search string, normalizes both sides, and returns matching tender IDs
CREATE OR REPLACE FUNCTION public.search_tenders_unaccent(
  search_text text,
  max_results integer DEFAULT 500
)
RETURNS SETOF uuid AS $$
  SELECT id FROM public.tenders
  WHERE lower(public.immutable_unaccent(objeto))
    LIKE '%' || lower(public.immutable_unaccent(search_text)) || '%'
  LIMIT max_results;
$$ LANGUAGE sql STABLE PARALLEL SAFE;

-- RPC function for accent-insensitive search on tender_documents.texto_extraido
CREATE OR REPLACE FUNCTION public.search_documents_unaccent(
  search_text text,
  max_results integer DEFAULT 200
)
RETURNS TABLE(tender_id uuid) AS $$
  SELECT DISTINCT td.tender_id
  FROM public.tender_documents td
  WHERE lower(public.immutable_unaccent(td.texto_extraido))
    LIKE '%' || lower(public.immutable_unaccent(search_text)) || '%'
  LIMIT max_results;
$$ LANGUAGE sql STABLE PARALLEL SAFE;
