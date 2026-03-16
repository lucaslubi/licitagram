-- Precision cleanup: remove non-competitive matches + recalculate inflated keyword scores
--
-- Issues found:
-- 1. Matches exist for Inexigibilidade/Inaplicabilidade (non-competitive, should never match)
-- 2. Keyword scores used old linear formula (8 phrases = 100), now exponential curve

-- Step 1: Delete matches for non-competitive modalities
-- These tenders have no real competition, so matching is pointless
DELETE FROM public.matches
WHERE tender_id IN (
  SELECT id FROM public.tenders
  WHERE modalidade_id IN (9, 14)  -- 9=Inexigibilidade, 14=Inaplicabilidade
);

-- Step 2: Recalculate keyword scores using the new exponential formula
-- The old formula was: min(100, phraseMatches * 12 + 6) — too generous
-- The new formula is: min(100, round(100 * (1 - exp(-phraseMatches * 0.18))))
--
-- We extract phrase count from breakdown[0].reason (format: "N frases: ...")
-- and recalculate the keyword component, then recompute the final score.
--
-- For matches where we can't extract phrase count, apply a conservative discount.

-- Step 2a: Recalculate for matches with extractable phrase count
UPDATE public.matches m
SET
  score = CASE
    -- Mode A (has CNAE score): CNAE*0.40 + KW_new*0.35 + Desc*0.25
    WHEN (m.breakdown::jsonb->2->>'score')::int > 0 THEN
      LEAST(100, ROUND(
        LEAST(100, ROUND(100 * (1 - EXP(-(
          COALESCE(
            NULLIF(REGEXP_REPLACE(m.breakdown::jsonb->0->>'reason', '^(\d+) frases.*', '\1'), m.breakdown::jsonb->0->>'reason'),
            '5'
          )::numeric
        ) * 0.18)))) * 0.35 +
        (m.breakdown::jsonb->2->>'score')::numeric * 0.40 +
        (m.breakdown::jsonb->1->>'score')::numeric * 0.25
      ))
    -- Mode B (no CNAE): KW_new*0.60 + Desc*0.40
    ELSE
      LEAST(100, ROUND(
        LEAST(100, ROUND(100 * (1 - EXP(-(
          COALESCE(
            NULLIF(REGEXP_REPLACE(m.breakdown::jsonb->0->>'reason', '^(\d+) frases.*', '\1'), m.breakdown::jsonb->0->>'reason'),
            '5'
          )::numeric
        ) * 0.18)))) * 0.60 +
        (m.breakdown::jsonb->1->>'score')::numeric * 0.40
      ))
  END,
  keyword_score = CASE
    WHEN (m.breakdown::jsonb->2->>'score')::int > 0 THEN
      LEAST(100, ROUND(
        LEAST(100, ROUND(100 * (1 - EXP(-(
          COALESCE(
            NULLIF(REGEXP_REPLACE(m.breakdown::jsonb->0->>'reason', '^(\d+) frases.*', '\1'), m.breakdown::jsonb->0->>'reason'),
            '5'
          )::numeric
        ) * 0.18)))) * 0.35 +
        (m.breakdown::jsonb->2->>'score')::numeric * 0.40 +
        (m.breakdown::jsonb->1->>'score')::numeric * 0.25
      ))
    ELSE
      LEAST(100, ROUND(
        LEAST(100, ROUND(100 * (1 - EXP(-(
          COALESCE(
            NULLIF(REGEXP_REPLACE(m.breakdown::jsonb->0->>'reason', '^(\d+) frases.*', '\1'), m.breakdown::jsonb->0->>'reason'),
            '5'
          )::numeric
        ) * 0.18)))) * 0.60 +
        (m.breakdown::jsonb->1->>'score')::numeric * 0.40
      ))
  END,
  updated_at = NOW()
WHERE m.match_source = 'keyword'
  AND m.breakdown IS NOT NULL
  AND jsonb_array_length(m.breakdown::jsonb) >= 2
  AND m.breakdown::jsonb->0->>'reason' ~ '^\d+ frases';

-- Step 2b: For remaining keyword matches without extractable breakdown,
-- apply a conservative cap (max 85 for keyword-only matches)
UPDATE public.matches
SET
  score = LEAST(85, score),
  keyword_score = LEAST(85, COALESCE(keyword_score, score)),
  updated_at = NOW()
WHERE match_source = 'keyword'
  AND score > 85
  AND (breakdown IS NULL OR NOT (breakdown::jsonb->0->>'reason' ~ '^\d+ frases'));
