-- Fix LICITAGRAM BOT tables: add missing columns and RLS policies

-- Add cookies column to bot_configs (for guided login session persistence)
ALTER TABLE public.bot_configs ADD COLUMN IF NOT EXISTS cookies TEXT;

-- Add started_at to bot_sessions if missing
ALTER TABLE public.bot_sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- Fix bot_actions RLS: add INSERT policy (manual bids from frontend)
CREATE POLICY IF NOT EXISTS "bot_actions_insert" ON public.bot_actions FOR INSERT
  WITH CHECK (session_id IN (
    SELECT id FROM public.bot_sessions WHERE company_id IN (
      SELECT company_id FROM public.users WHERE id = auth.uid()
    )
  ));

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
