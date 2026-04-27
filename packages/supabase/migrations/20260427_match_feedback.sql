-- F-Q4: User 👍/👎 feedback on each match
-- Captures explicit relevance signals for future calibration / UI confidence boosters.

CREATE TABLE IF NOT EXISTS public.match_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vote VARCHAR(10) NOT NULL CHECK (vote IN ('up','down')),
  reason TEXT,                    -- optional: why down (caro, fora-de-area, etc)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT match_feedback_unique_per_user UNIQUE (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_feedback_company_vote
  ON public.match_feedback(company_id, vote, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_feedback_match
  ON public.match_feedback(match_id);

-- RLS
ALTER TABLE public.match_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "match_feedback_read_own_company" ON public.match_feedback;
CREATE POLICY "match_feedback_read_own_company"
  ON public.match_feedback FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT company_id FROM public.users WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "match_feedback_insert_own" ON public.match_feedback;
CREATE POLICY "match_feedback_insert_own"
  ON public.match_feedback FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "match_feedback_update_own" ON public.match_feedback;
CREATE POLICY "match_feedback_update_own"
  ON public.match_feedback FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "match_feedback_delete_own" ON public.match_feedback;
CREATE POLICY "match_feedback_delete_own"
  ON public.match_feedback FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "match_feedback_service_role" ON public.match_feedback;
CREATE POLICY "match_feedback_service_role"
  ON public.match_feedback FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Reusable updated_at trigger function (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_match_feedback_updated_at ON public.match_feedback;
CREATE TRIGGER trg_match_feedback_updated_at
  BEFORE UPDATE ON public.match_feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.match_feedback IS 'Cliente vota 👍/👎 em cada match. Insumo pra calibração futura (F-Q4).';
