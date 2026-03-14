-- On-demand AI analysis: add keyword matching support
-- Existing matches keep match_source='ai', new keyword matches use match_source='keyword'

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS keyword_score INTEGER;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS match_source TEXT DEFAULT 'ai';

-- Add check constraint for match_source (safe: only if not exists)
DO $$ BEGIN
  ALTER TABLE public.matches ADD CONSTRAINT matches_match_source_check
    CHECK (match_source IN ('keyword', 'ai'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index for filtering by match source
CREATE INDEX IF NOT EXISTS idx_matches_match_source ON public.matches(match_source);
