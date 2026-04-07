-- Admin Dashboard v2: enriched client overview + anomaly detection
-- Safe to re-run: uses CREATE OR REPLACE and IF NOT EXISTS.
-- Does NOT drop or alter existing tables.

-- ============================================================
-- 1. Enriched admin_client_overview view
-- ============================================================
-- Adds contact channels, activity timestamps, match windows, CNAE health,
-- unread notification count. Keeps all prior columns for backwards compat.

CREATE OR REPLACE VIEW public.admin_client_overview AS
SELECT
  c.id                                AS company_id,
  c.cnpj,
  c.razao_social,
  c.nome_fantasia,
  c.uf,
  c.cnae_principal,
  c.descricao_servicos,
  c.created_at                        AS company_created_at,

  -- Subscription
  s.id                                AS subscription_id,
  s.status                            AS subscription_status,
  s.plan_id,
  s.matches_used_this_month,
  s.current_period_end,
  p.slug                              AS plan_slug,
  p.name                              AS plan_name,
  p.price_cents,

  -- Users
  (SELECT COUNT(*) FROM public.users u
    WHERE u.company_id = c.id AND u.is_active = true)              AS active_users,

  -- Primary contact (oldest active user)
  (SELECT u.email FROM public.users u
    WHERE u.company_id = c.id AND u.is_active = true
    ORDER BY u.created_at ASC LIMIT 1)                              AS email_principal,
  (SELECT u.whatsapp_number FROM public.users u
    WHERE u.company_id = c.id AND u.whatsapp_number IS NOT NULL
    ORDER BY u.created_at ASC LIMIT 1)                              AS whatsapp_number,
  (SELECT u.telegram_chat_id FROM public.users u
    WHERE u.company_id = c.id AND u.telegram_chat_id IS NOT NULL
    ORDER BY u.created_at ASC LIMIT 1)                              AS telegram_chat_id,

  -- Channel-connected flags
  EXISTS (SELECT 1 FROM public.users u
          WHERE u.company_id = c.id AND u.whatsapp_number IS NOT NULL) AS whatsapp_connected,
  EXISTS (SELECT 1 FROM public.users u
          WHERE u.company_id = c.id AND u.telegram_chat_id IS NOT NULL) AS telegram_connected,

  -- Activity
  (SELECT MAX(au.last_sign_in_at) FROM auth.users au
    JOIN public.users pu ON pu.id = au.id
    WHERE pu.company_id = c.id)                                     AS last_login_at,

  -- Matches
  (SELECT COUNT(*) FROM public.matches m WHERE m.company_id = c.id)  AS total_matches,
  (SELECT COUNT(*) FROM public.matches m
    WHERE m.company_id = c.id AND m.created_at >= NOW() - INTERVAL '7 days')  AS matches_7d,
  (SELECT COUNT(*) FROM public.matches m
    WHERE m.company_id = c.id AND m.created_at >= NOW() - INTERVAL '30 days') AS matches_30d,
  (SELECT MAX(m.created_at) FROM public.matches m WHERE m.company_id = c.id) AS last_match_at,

  -- CNAE health
  (c.cnae_principal IS NOT NULL AND c.cnae_principal ~ '^\d{7}$')   AS has_valid_cnae,

  -- Unread notifications
  (SELECT COUNT(*) FROM public.notifications n
    JOIN public.users u ON u.id = n.user_id
    WHERE u.company_id = c.id AND n.read = false)                   AS notifications_unread

FROM public.companies c
LEFT JOIN public.subscriptions s ON s.company_id = c.id
LEFT JOIN public.plans p ON s.plan_id = p.id;


-- ============================================================
-- 2. admin_alerts table (anomaly notifications for platform admins)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved    BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Dedupe: one active alert per (company, type)
  CONSTRAINT admin_alerts_unique_active UNIQUE (company_id, type, resolved)
);

CREATE INDEX IF NOT EXISTS idx_admin_alerts_unresolved
  ON public.admin_alerts(created_at DESC) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_admin_alerts_company
  ON public.admin_alerts(company_id);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_severity
  ON public.admin_alerts(severity) WHERE resolved = false;

ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

-- Only service role writes; admins read via server actions (service role).
DROP POLICY IF EXISTS "admin_alerts_service_all" ON public.admin_alerts;
CREATE POLICY "admin_alerts_service_all" ON public.admin_alerts
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');


-- ============================================================
-- 3. detect_client_anomalies(): scan and upsert alerts
-- ============================================================
CREATE OR REPLACE FUNCTION public.detect_client_anomalies()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  alert_count INTEGER := 0;
BEGIN
  -- Resolve stale unresolved alerts first (re-evaluated every run)
  UPDATE public.admin_alerts
     SET resolved = true, resolved_at = NOW()
   WHERE resolved = false
     AND created_at < NOW() - INTERVAL '48 hours';

  -- A) cnae_invalid: company has no valid 7-digit CNAE
  INSERT INTO public.admin_alerts (type, severity, company_id, message, metadata)
  SELECT 'cnae_invalid', 'critical', c.id,
         'Empresa sem CNAE válido — Inteligência Competitiva não funciona',
         jsonb_build_object('cnae_principal', c.cnae_principal)
    FROM public.companies c
    JOIN public.subscriptions s ON s.company_id = c.id
   WHERE s.status = 'active'
     AND (c.cnae_principal IS NULL OR c.cnae_principal !~ '^\d{7}$')
  ON CONFLICT (company_id, type, resolved) DO NOTHING;
  GET DIAGNOSTICS alert_count = ROW_COUNT;

  -- B) no_channels: active sub but no whatsapp/telegram hooked up
  INSERT INTO public.admin_alerts (type, severity, company_id, message, metadata)
  SELECT 'no_channels', 'warning', c.id,
         'Nenhum canal de notificação conectado (WhatsApp/Telegram)',
         '{}'::jsonb
    FROM public.companies c
    JOIN public.subscriptions s ON s.company_id = c.id
   WHERE s.status = 'active'
     AND NOT EXISTS (
       SELECT 1 FROM public.users u
        WHERE u.company_id = c.id
          AND (u.whatsapp_number IS NOT NULL OR u.telegram_chat_id IS NOT NULL)
     )
  ON CONFLICT (company_id, type, resolved) DO NOTHING;

  -- C) no_matches_7d: active sub, has valid CNAE, zero matches in 7d
  INSERT INTO public.admin_alerts (type, severity, company_id, message, metadata)
  SELECT 'no_matches_7d', 'warning', c.id,
         'Sem matches nos últimos 7 dias',
         jsonb_build_object('cnae', c.cnae_principal)
    FROM public.companies c
    JOIN public.subscriptions s ON s.company_id = c.id
   WHERE s.status = 'active'
     AND c.cnae_principal ~ '^\d{7}$'
     AND c.created_at < NOW() - INTERVAL '7 days'
     AND NOT EXISTS (
       SELECT 1 FROM public.matches m
        WHERE m.company_id = c.id
          AND m.created_at >= NOW() - INTERVAL '7 days'
     )
  ON CONFLICT (company_id, type, resolved) DO NOTHING;

  -- D) inactive_user: no login in 14 days on active subscription
  INSERT INTO public.admin_alerts (type, severity, company_id, message, metadata)
  SELECT 'inactive_user', 'warning', c.id,
         'Usuário sem login há mais de 14 dias',
         jsonb_build_object('last_login', MAX(au.last_sign_in_at))
    FROM public.companies c
    JOIN public.subscriptions s ON s.company_id = c.id
    JOIN public.users u ON u.company_id = c.id
    JOIN auth.users au ON au.id = u.id
   WHERE s.status = 'active'
   GROUP BY c.id
  HAVING COALESCE(MAX(au.last_sign_in_at), '1970-01-01'::timestamptz) < NOW() - INTERVAL '14 days'
  ON CONFLICT (company_id, type, resolved) DO NOTHING;

  -- E) subscription_past_due
  INSERT INTO public.admin_alerts (type, severity, company_id, message, metadata)
  SELECT 'subscription_past_due', 'critical', c.id,
         'Assinatura com pagamento em atraso',
         jsonb_build_object('status', s.status)
    FROM public.companies c
    JOIN public.subscriptions s ON s.company_id = c.id
   WHERE s.status IN ('past_due','unpaid')
  ON CONFLICT (company_id, type, resolved) DO NOTHING;

  -- F) high_matches_no_engagement: >20 matches in 7d but zero notification reads
  INSERT INTO public.admin_alerts (type, severity, company_id, message, metadata)
  SELECT 'high_matches_no_engagement', 'info', c.id,
         'Muitos matches mas cliente não está engajando com notificações',
         jsonb_build_object('matches_7d', match_count)
    FROM (
      SELECT c.id,
             COUNT(m.id) AS match_count
        FROM public.companies c
        JOIN public.subscriptions s ON s.company_id = c.id
        LEFT JOIN public.matches m ON m.company_id = c.id
         AND m.created_at >= NOW() - INTERVAL '7 days'
       WHERE s.status = 'active'
       GROUP BY c.id
    ) mc
    JOIN public.companies c ON c.id = mc.id
   WHERE mc.match_count > 20
     AND NOT EXISTS (
       SELECT 1 FROM public.notifications n
         JOIN public.users u ON u.id = n.user_id
        WHERE u.company_id = c.id
          AND n.read = true
          AND n.created_at >= NOW() - INTERVAL '7 days'
     )
  ON CONFLICT (company_id, type, resolved) DO NOTHING;

  RETURN (SELECT COUNT(*) FROM public.admin_alerts WHERE resolved = false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_client_anomalies() TO service_role;
