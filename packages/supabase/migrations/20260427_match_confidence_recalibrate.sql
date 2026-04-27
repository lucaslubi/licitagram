-- ============================================================
-- Recalibrate match_confidence trigger
-- ============================================================
-- A versão original exigia AMBOS engines (pgvector ≥ 65 AND keyword ≥ 60)
-- pra ser "high". Mas na prática a maioria dos matches só tem UM engine
-- preenchido (272k rows com pgvector=NULL, 153k rows com keyword=NULL).
-- Resultado: 0 high, 2k medium, 310k low — tier inútil.
--
-- Nova lógica reconhece sinal forte sozinho como "alta":
--   high   = (pgvector ≥ 65 AND keyword ≥ 60)  ← 2 engines concordam
--          OR pgvector ≥ 75                     ← pgvector forte sozinho
--          OR keyword  ≥ 80                     ← keyword muito forte
--          OR semantic ≥ 75                     ← semantic forte
--   medium = qualquer engine ≥ 55
--   low    = passou só threshold mínimo
--
-- Pós-recalibragem: high=265, medium=67k, low=246k. Útil pro UX.
-- ============================================================

CREATE OR REPLACE FUNCTION public.compute_match_confidence() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  s_pg NUMERIC := COALESCE(NEW.score_by_pgvector, 0);
  s_kw NUMERIC := COALESCE(NEW.score_by_keyword, 0);
  s_se NUMERIC := COALESCE(NEW.score_by_semantic, 0);
  s_max NUMERIC := GREATEST(s_pg, s_kw, s_se);
BEGIN
  IF (s_pg >= 65 AND s_kw >= 60) OR s_pg >= 75 OR s_kw >= 80 OR s_se >= 75 THEN
    NEW.match_confidence := 'high';
  ELSIF s_max >= 55 THEN
    NEW.match_confidence := 'medium';
  ELSE
    NEW.match_confidence := 'low';
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill rows existentes
UPDATE public.matches
SET match_confidence = CASE
  WHEN (COALESCE(score_by_pgvector,0) >= 65 AND COALESCE(score_by_keyword,0) >= 60)
    OR COALESCE(score_by_pgvector,0) >= 75
    OR COALESCE(score_by_keyword,0) >= 80
    OR COALESCE(score_by_semantic,0) >= 75 THEN 'high'
  WHEN GREATEST(
         COALESCE(score_by_pgvector,0),
         COALESCE(score_by_keyword,0),
         COALESCE(score_by_semantic,0)
       ) >= 55 THEN 'medium'
  ELSE 'low'
END;
