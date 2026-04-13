-- Fix 3 Supabase Security Advisor issues:
-- 1. admin_client_overview exposes auth.users in public schema view
-- 2. admin_client_overview has SECURITY DEFINER (implicit default)
-- 3. drive_usage has SECURITY DEFINER (implicit default)
--
-- Strategy:
--   • Recreate both views with explicit SECURITY INVOKER
--   • Replace direct auth.users access in admin_client_overview with a
--     SECURITY DEFINER helper function (minimal surface, service_role only)
--   • Keep detect_client_anomalies() as SECURITY DEFINER (it needs auth.users)
--     but restrict execution to service_role only (already done)

-- ============================================================
-- 1. Helper: get last login for a company (wraps auth.users access)
-- ============================================================
-- This tiny SECURITY DEFINER function replaces the raw auth.users subquery
-- that was exposed in the public view. Only service_role can call it.

CREATE OR REPLACE FUNCTION public.get_company_last_login(p_company_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT MAX(au.last_sign_in_at)
    FROM auth.users au
    JOIN public.users pu ON pu.id = au.id
   WHERE pu.company_id = p_company_id;
$$;

-- Restrict to service_role only
REVOKE ALL ON FUNCTION public.get_company_last_login(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_company_last_login(UUID) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_company_last_login(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_company_last_login(UUID) TO service_role;


-- ============================================================
-- 2. Recreate admin_client_overview with SECURITY INVOKER
--    (no more direct auth.users reference in the view body)
-- ============================================================
DROP VIEW IF EXISTS public.admin_client_overview;

CREATE VIEW public.admin_client_overview
WITH (security_invoker = true)
AS
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

  -- Activity — uses SECURITY DEFINER helper instead of direct auth.users access
  public.get_company_last_login(c.id)                               AS last_login_at,

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
-- 3. Recreate drive_usage with SECURITY INVOKER
-- ============================================================
DROP VIEW IF EXISTS public.drive_usage;

CREATE VIEW public.drive_usage
WITH (security_invoker = true)
AS
SELECT
  company_id,
  COUNT(*) as total_files,
  SUM(file_size) as total_bytes,
  COUNT(DISTINCT folder) as total_folders,
  COUNT(*) FILTER (WHERE category = 'edital') as editais,
  COUNT(*) FILTER (WHERE category = 'certidao') as certidoes,
  COUNT(*) FILTER (WHERE category = 'proposta') as propostas,
  COUNT(*) FILTER (WHERE category = 'analise') as analises,
  COUNT(*) FILTER (WHERE category = 'consultor') as consultor_ia,
  MAX(created_at) as last_upload
FROM drive_files
GROUP BY company_id;


-- ============================================================
-- 4. Harden detect_client_anomalies() — already SECURITY DEFINER
--    Just ensure REVOKE from public/authenticated/anon
-- ============================================================
REVOKE ALL ON FUNCTION public.detect_client_anomalies() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.detect_client_anomalies() FROM authenticated;
REVOKE ALL ON FUNCTION public.detect_client_anomalies() FROM anon;
GRANT EXECUTE ON FUNCTION public.detect_client_anomalies() TO service_role;
