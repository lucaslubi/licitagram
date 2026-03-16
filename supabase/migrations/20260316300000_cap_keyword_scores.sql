-- Cap ALL keyword-only match scores to precision limits
--
-- Root cause: keyword matching alone cannot guarantee relevance.
-- A tender for "material de construção" was scoring 84 for an IT company
-- because generic words like "rede", "sistema", "dados" matched.
--
-- New limits:
-- - Mode A (CNAE-gated, has CNAE overlap): max 75
-- - Mode B (keyword-only, no CNAE data): max 60
-- - Only AI analysis can push scores above these caps
--
-- Since we can't distinguish Mode A from Mode B in stored data,
-- we apply the conservative cap of 75 to ALL keyword matches.
-- Mode B matches that were incorrectly > 60 will also be caught.

-- Step 1: Cap all keyword matches at 75
UPDATE public.matches
SET
  score = LEAST(75, score),
  keyword_score = LEAST(75, COALESCE(keyword_score, score)),
  updated_at = NOW()
WHERE match_source = 'keyword'
  AND score > 75;

-- Step 2: Delete matches for non-competitive modalities (belt + suspenders)
DELETE FROM public.matches
WHERE tender_id IN (
  SELECT id FROM public.tenders
  WHERE modalidade_id IN (9, 14)
);

-- Step 3: Delete matches for expired tenders (data_encerramento in the past)
DELETE FROM public.matches
WHERE tender_id IN (
  SELECT id FROM public.tenders
  WHERE data_encerramento IS NOT NULL
    AND data_encerramento < NOW() - INTERVAL '7 days'
);

-- Log results
DO $$
DECLARE
  keyword_above_75 INTEGER;
  total_keyword INTEGER;
  avg_score NUMERIC;
BEGIN
  SELECT count(*), round(avg(score)::numeric, 1)
  INTO total_keyword, avg_score
  FROM public.matches
  WHERE match_source = 'keyword';

  SELECT count(*) INTO keyword_above_75
  FROM public.matches
  WHERE match_source = 'keyword' AND score > 75;

  RAISE NOTICE 'Total keyword matches: %, avg score: %, above 75: % (should be 0)', total_keyword, avg_score, keyword_above_75;
END $$;
