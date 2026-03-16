-- Reset AI-analyzed matches to force re-analysis with precise prompt
--
-- Problem: Previous AI prompt was too generous ("SEJA GENEROSO", "Na dúvida INCLUA")
-- causing inflated scores (100 for matches outside company's actual area).
--
-- Solution: Reset AI-analyzed matches to their keyword_score, clear AI data,
-- so they can be re-analyzed with the new precision-focused prompt.

-- Step 1: For matches with AI analysis, restore keyword_score as the score
-- and clear AI data so it gets re-analyzed
UPDATE public.matches
SET
  score = COALESCE(keyword_score, 50), -- Fallback to 50 if no keyword_score
  ai_justificativa = NULL,
  breakdown = '[]'::jsonb,
  riscos = '[]'::jsonb,
  acoes_necessarias = '[]'::jsonb,
  recomendacao = NULL,
  match_source = 'keyword',
  updated_at = NOW()
WHERE match_source = 'ai';

-- Step 2: Add a column to track when analysis was last done (for freshness)
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

-- Step 3: Create index for efficient freshness queries
CREATE INDEX IF NOT EXISTS idx_matches_analyzed_at
  ON public.matches(analyzed_at)
  WHERE analyzed_at IS NOT NULL;

-- Step 4: Log how many matches were reset
DO $$
DECLARE
  reset_count INTEGER;
BEGIN
  SELECT count(*) INTO reset_count
  FROM public.matches
  WHERE match_source = 'keyword' AND keyword_score IS NOT NULL AND ai_justificativa IS NULL;

  RAISE NOTICE 'Reset % AI-analyzed matches to keyword scores for re-analysis', reset_count;
END $$;
