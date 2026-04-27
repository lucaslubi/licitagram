-- F-Q3: Notification preferences em bot_configs
-- Cliente self-service via /conta/notificacoes (presets + controles avançados).
-- Linha de prefs vive em bot_configs com portal='_notifications' (uma por company).
ALTER TABLE public.bot_configs
  ADD COLUMN IF NOT EXISTS notification_preset VARCHAR(20)
    DEFAULT 'equilibrado'
    CHECK (notification_preset IN ('alta_qualidade','equilibrado','tudo','custom')),
  ADD COLUMN IF NOT EXISTS min_score_notify INTEGER DEFAULT 55
    CHECK (min_score_notify BETWEEN 40 AND 100),
  ADD COLUMN IF NOT EXISTS max_notifs_per_day INTEGER DEFAULT 50
    CHECK (max_notifs_per_day BETWEEN 1 AND 200),
  ADD COLUMN IF NOT EXISTS notif_quiet_start TIME,
  ADD COLUMN IF NOT EXISTS notif_quiet_end TIME,
  ADD COLUMN IF NOT EXISTS notif_channels TEXT[]
    DEFAULT ARRAY['email']::TEXT[],
  ADD COLUMN IF NOT EXISTS notif_excluded_terms TEXT[],
  ADD COLUMN IF NOT EXISTS notif_engines TEXT[]
    DEFAULT ARRAY['pgvector_rules','keyword']::TEXT[],
  ADD COLUMN IF NOT EXISTS daily_digest_enabled BOOLEAN DEFAULT true;

-- Adiciona '_notifications' ao set de portais válidos para acomodar a linha de prefs.
ALTER TABLE public.bot_configs DROP CONSTRAINT IF EXISTS bot_configs_portal_check;
ALTER TABLE public.bot_configs ADD CONSTRAINT bot_configs_portal_check
  CHECK (portal = ANY (ARRAY['comprasnet','bll','portal_compras','licitacoes_e','pncp','comprasgov','bec','_notifications']));

CREATE INDEX IF NOT EXISTS idx_bot_configs_company ON public.bot_configs(company_id);
COMMENT ON COLUMN public.bot_configs.notification_preset IS 'Preset rápido de qualidade. custom = controles avançados ativos.';
