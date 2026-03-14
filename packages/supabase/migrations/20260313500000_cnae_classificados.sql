-- Migration: Add cnae_classificados column for CNAE-first matching engine
-- This column stores the AI-classified CNAE divisions (2-digit codes) for each tender,
-- enabling efficient CNAE-gated matching between companies and tenders.

-- 1. Add cnae_classificados column (array of 2-digit CNAE division codes)
ALTER TABLE public.tenders
  ADD COLUMN IF NOT EXISTS cnae_classificados TEXT[] DEFAULT '{}';

-- 2. Create GIN index for efficient array overlap queries (&&, @>, <@)
CREATE INDEX IF NOT EXISTS idx_tenders_cnae_classificados
  ON public.tenders USING gin(cnae_classificados);

-- 3. Backfill from existing requisitos.cnae_relacionados data
-- Many tenders already have CNAE codes extracted by the requirement-extractor
UPDATE public.tenders
SET cnae_classificados = (
  SELECT ARRAY(
    SELECT DISTINCT LEFT(elem::text, 2)
    FROM jsonb_array_elements_text(requisitos->'cnae_relacionados') AS elem
    WHERE LENGTH(elem::text) >= 2
  )
)
WHERE requisitos IS NOT NULL
  AND requisitos->'cnae_relacionados' IS NOT NULL
  AND jsonb_typeof(requisitos->'cnae_relacionados') = 'array'
  AND jsonb_array_length(requisitos->'cnae_relacionados') > 0
  AND (cnae_classificados IS NULL OR cnae_classificados = '{}');
