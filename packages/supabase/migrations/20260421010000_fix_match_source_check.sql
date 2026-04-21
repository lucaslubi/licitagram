-- HOTFIX: o CHECK constraint em matches.match_source ainda não incluía
-- 'pgvector_rules', causando upsert falhar no pgvector-matcher.
--
-- Dropa o constraint antigo (se existir) e recria com todos os valores válidos
-- da engine atual. Idempotente.

DO $$
DECLARE
  v_conname TEXT;
BEGIN
  -- Encontra qualquer CHECK constraint em match_source
  FOR v_conname IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.matches'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%match_source%'
  LOOP
    EXECUTE format('ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS %I', v_conname);
  END LOOP;
END
$$;

-- Recria constraint permissivo com todos os sources usados hoje
ALTER TABLE public.matches
  ADD CONSTRAINT matches_match_source_check
  CHECK (
    match_source IS NULL
    OR match_source IN (
      'pgvector_rules',  -- engine determinística nova (shadow mode)
      'ai_triage',       -- LLM triage antigo
      'ai',              -- legado (pré ai_triage)
      'keyword',         -- keyword matcher fallback
      'semantic',        -- semantic-matching worker
      'manual',          -- override manual do admin
      'onboarding'       -- matches criados durante signup
    )
  );

COMMENT ON CONSTRAINT matches_match_source_check ON public.matches
  IS 'Whitelist de match sources. Ver /workers/src/processors/ para valores emitidos.';
