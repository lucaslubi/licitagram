-- Fix remaining inflated scores that escaped the precision_cleanup migration
--
-- Issues:
-- 1. 232 new matches for Inexigibilidade (modalidade_id=9) created today
-- 2. 11 keyword matches with score > 85 that have empty breakdown []
--    (the cleanup migration's regex check returned NULL on empty arrays,
--     causing them to slip through the WHERE clause)

-- Step 1: Delete ALL matches for non-competitive modalities (again, for new ones)
DELETE FROM public.matches
WHERE tender_id IN (
  SELECT id FROM public.tenders
  WHERE modalidade_id IN (9, 14)
);

-- Step 2: Cap keyword matches with empty or NULL breakdown at 85
-- These can't be recalculated (no phrase count data), so cap conservatively
UPDATE public.matches
SET
  score = LEAST(85, score),
  keyword_score = LEAST(85, COALESCE(keyword_score, score)),
  updated_at = NOW()
WHERE match_source = 'keyword'
  AND score > 85
  AND (
    breakdown IS NULL
    OR breakdown::text = '[]'
    OR breakdown::text = 'null'
    OR jsonb_array_length(breakdown::jsonb) = 0
  );

-- Step 3: Safety net — cap ALL keyword matches at 95
-- No keyword-only match should ever be 96-100 (exponential curve maxes ~95 at 17+ phrases)
UPDATE public.matches
SET
  score = LEAST(95, score),
  keyword_score = LEAST(95, COALESCE(keyword_score, score)),
  updated_at = NOW()
WHERE match_source = 'keyword'
  AND score > 95;

-- Log results
DO $$
DECLARE
  remaining_noncomp INTEGER;
  remaining_inflated INTEGER;
BEGIN
  SELECT count(*) INTO remaining_noncomp
  FROM public.matches m
  JOIN public.tenders t ON t.id = m.tender_id
  WHERE t.modalidade_id IN (9, 14);

  SELECT count(*) INTO remaining_inflated
  FROM public.matches
  WHERE match_source = 'keyword' AND score > 95;

  RAISE NOTICE 'Non-competitive matches remaining: % (should be 0)', remaining_noncomp;
  RAISE NOTICE 'Keyword matches > 95 remaining: % (should be 0)', remaining_inflated;
END $$;
