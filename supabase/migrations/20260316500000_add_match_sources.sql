-- Add ai_triage and semantic to allowed match_source values
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_match_source_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_match_source_check
  CHECK (match_source IN ('keyword', 'ai', 'ai_triage', 'semantic'));
