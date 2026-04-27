-- ============================================================
-- Split match scores by engine (fix cross-source writer collision)
-- ============================================================
-- Problema: keyword-matcher e pgvector-matcher faziam UPSERT no
-- mesmo campo `score`, sobrescrevendo um ao outro. score_final
-- aparecia confuso em map_cache, hot-alerts, notifications.
--
-- Fix: adicionar colunas separadas por engine (score_by_*) e
-- score_final = GREATEST(...). Trigger mantém `score` legacy
-- como espelho pra consumers antigos não quebrarem.
--
-- NÃO confundir com colunas existentes score_semantic/cnae/keyword/
-- valor/modalidade/uf, que são SUBSCORES 0-1 do breakdown do
-- pgvector_rules (componentes do score, não scores por engine).
-- ============================================================

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS score_by_pgvector NUMERIC,
  ADD COLUMN IF NOT EXISTS score_by_keyword  NUMERIC,
  ADD COLUMN IF NOT EXISTS score_by_semantic NUMERIC,
  ADD COLUMN IF NOT EXISTS score_by_ai       NUMERIC;

-- Backfill: a partir do match_source atual, copia o score legacy pra
-- coluna correspondente. Idempotente: só preenche se ainda for NULL.
UPDATE public.matches SET score_by_pgvector = score
  WHERE match_source = 'pgvector_rules' AND score_by_pgvector IS NULL;
UPDATE public.matches SET score_by_keyword  = score
  WHERE match_source = 'keyword'        AND score_by_keyword  IS NULL;
UPDATE public.matches SET score_by_semantic = score
  WHERE match_source = 'semantic'       AND score_by_semantic IS NULL;
UPDATE public.matches SET score_by_ai       = score
  WHERE match_source IN ('ai','ai_triage') AND score_by_ai IS NULL;

-- score_final: maior entre os quatro. Coluna NORMAL (não generated)
-- pra permitir trigger antes de INSERT calcular tudo num passe só.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS score_final NUMERIC;

-- match_source_primary: qual engine produziu o maior score (pra exibição)
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS match_source_primary TEXT;

-- Trigger: recalcula score_final, match_source_primary, e espelha em score legacy
CREATE OR REPLACE FUNCTION public.compute_match_score_final() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  s_pg  NUMERIC := COALESCE(NEW.score_by_pgvector, 0);
  s_kw  NUMERIC := COALESCE(NEW.score_by_keyword,  0);
  s_se  NUMERIC := COALESCE(NEW.score_by_semantic, 0);
  s_ai  NUMERIC := COALESCE(NEW.score_by_ai,       0);
  m     NUMERIC;
BEGIN
  m := GREATEST(s_pg, s_kw, s_se, s_ai);
  NEW.score_final := CASE WHEN m = 0 THEN NULL ELSE m END;

  NEW.match_source_primary := CASE
    WHEN NEW.score_final IS NULL THEN NULL
    WHEN s_pg = m AND NEW.score_by_pgvector IS NOT NULL THEN 'pgvector_rules'
    WHEN s_kw = m AND NEW.score_by_keyword  IS NOT NULL THEN 'keyword'
    WHEN s_se = m AND NEW.score_by_semantic IS NOT NULL THEN 'semantic'
    WHEN s_ai = m AND NEW.score_by_ai       IS NOT NULL THEN 'ai'
    ELSE NULL
  END;

  -- Espelha no campo legacy `score` pra consumers antigos.
  IF NEW.score_final IS NOT NULL THEN
    NEW.score := NEW.score_final;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_match_score_final ON public.matches;
CREATE TRIGGER trg_compute_match_score_final
  BEFORE INSERT OR UPDATE OF score_by_pgvector, score_by_keyword, score_by_semantic, score_by_ai
  ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.compute_match_score_final();

-- Backfill score_final/match_source_primary nas rows existentes (trigger não dispara em ALTER)
UPDATE public.matches SET score_by_pgvector = score_by_pgvector
  WHERE score_final IS NULL AND (
    score_by_pgvector IS NOT NULL OR score_by_keyword IS NOT NULL
    OR score_by_semantic IS NOT NULL OR score_by_ai IS NOT NULL
  );

-- Índices
CREATE INDEX IF NOT EXISTS idx_matches_score_final
  ON public.matches (score_final DESC) WHERE score_final IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_source_primary
  ON public.matches (match_source_primary, score_final DESC);

-- Comentários
COMMENT ON COLUMN public.matches.score_by_pgvector IS '0-100 score from pgvector_rules engine';
COMMENT ON COLUMN public.matches.score_by_keyword  IS '0-100 score from keyword-matcher engine';
COMMENT ON COLUMN public.matches.score_by_semantic IS '0-100 score from semantic-matcher (legacy)';
COMMENT ON COLUMN public.matches.score_by_ai       IS '0-100 score from ai/ai_triage (deprecated 2026-04-21)';
COMMENT ON COLUMN public.matches.score_final       IS 'GREATEST(score_by_*); espelhado em score legacy via trigger';
COMMENT ON COLUMN public.matches.match_source_primary IS 'Engine que produziu o maior score (pra exibição)';
