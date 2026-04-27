-- Coluna match_confidence calculada via trigger ao mudar score_by_*.
-- Classifica matches em alta/média/baixa confiança baseado na concordância dos engines.
--
-- Lógica:
--   high   : pgvector >= 65 AND keyword >= 60 (ambos engines concordam forte)
--   medium : pgvector >= 65 OR  keyword >= 70 (um engine forte sozinho)
--   low    : passou só no threshold mínimo
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS match_confidence VARCHAR(10);

CREATE OR REPLACE FUNCTION public.compute_match_confidence() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  s_pg NUMERIC := COALESCE(NEW.score_by_pgvector, 0);
  s_kw NUMERIC := COALESCE(NEW.score_by_keyword, 0);
BEGIN
  IF s_pg >= 65 AND s_kw >= 60 THEN
    NEW.match_confidence := 'high';
  ELSIF s_pg >= 65 OR s_kw >= 70 THEN
    NEW.match_confidence := 'medium';
  ELSE
    NEW.match_confidence := 'low';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_match_confidence ON public.matches;
CREATE TRIGGER trg_compute_match_confidence
  BEFORE INSERT OR UPDATE OF score_by_pgvector, score_by_keyword
  ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.compute_match_confidence();

-- Backfill rows existentes (trigger não dispara em ALTER)
UPDATE public.matches
SET match_confidence = CASE
  WHEN COALESCE(score_by_pgvector, 0) >= 65 AND COALESCE(score_by_keyword, 0) >= 60 THEN 'high'
  WHEN COALESCE(score_by_pgvector, 0) >= 65 OR COALESCE(score_by_keyword, 0) >= 70 THEN 'medium'
  ELSE 'low'
END
WHERE match_confidence IS NULL;

CREATE INDEX IF NOT EXISTS idx_matches_confidence ON public.matches(company_id, match_confidence, score_final DESC);
COMMENT ON COLUMN public.matches.match_confidence IS 'high (pgvector >=65 AND keyword >=60), medium (one strong), low (threshold mínimo)';
