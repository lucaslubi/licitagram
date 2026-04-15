-- ============================================================
-- PREGÃO CHAT MONITOR — Plan feature gating
--
-- Adds pregao_chat_monitor feature flag and monitor limit to plans.
-- Starter: disabled. Professional: enabled, 3 monitors. Enterprise: enabled, unlimited.
--
-- DOWN MIGRATION:
--   UPDATE public.plans SET features = features - 'pregao_chat_monitor';
--   ALTER TABLE public.plans DROP COLUMN IF EXISTS max_pregao_monitors;
-- ============================================================

-- Add limit column for monitor count per plan (NULL = unlimited)
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_pregao_monitors INTEGER;

-- Starter: no access
UPDATE public.plans
  SET features = features || '{"pregao_chat_monitor": false}'::jsonb,
      max_pregao_monitors = 0
  WHERE slug = 'starter';

-- Professional: up to 3 monitors
UPDATE public.plans
  SET features = features || '{"pregao_chat_monitor": true}'::jsonb,
      max_pregao_monitors = 3
  WHERE slug = 'professional';

-- Enterprise: unlimited monitors
UPDATE public.plans
  SET features = features || '{"pregao_chat_monitor": true}'::jsonb,
      max_pregao_monitors = NULL
  WHERE slug = 'enterprise';
