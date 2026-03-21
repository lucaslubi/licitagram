-- Fix RLS for bot_configs: ensure INSERT is allowed via explicit WITH CHECK policy.
-- The existing FOR ALL + USING policy may not properly cover INSERT in all cases.
-- Drop the old policy and recreate with both USING and WITH CHECK.

DROP POLICY IF EXISTS "Users manage own bot configs" ON public.bot_configs;

CREATE POLICY "Users manage own bot configs"
  ON public.bot_configs FOR ALL
  USING (company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid()));

-- Also fix bot_sessions for consistency
DROP POLICY IF EXISTS "Users manage own bot sessions" ON public.bot_sessions;

CREATE POLICY "Users manage own bot sessions"
  ON public.bot_sessions FOR ALL
  USING (company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid()));

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
