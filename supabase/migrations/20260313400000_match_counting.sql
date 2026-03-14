-- ============================================================
-- MATCH COUNTING: Atomic functions for plan limit enforcement
-- Used by keyword-matcher workers to check/increment limits
-- ============================================================

-- Atomic increment + limit check (prevents race conditions)
-- Called from workers before creating each match
CREATE OR REPLACE FUNCTION public.increment_match_count(
  p_company_id UUID,
  p_amount INTEGER DEFAULT 1
)
RETURNS TABLE(new_count INTEGER, limit_reached BOOLEAN) AS $$
DECLARE
  v_current INTEGER;
  v_max INTEGER;
  v_status TEXT;
  v_reset_at TIMESTAMPTZ;
BEGIN
  -- Lock the subscription row to prevent concurrent updates
  SELECT s.matches_used_this_month, p.max_matches_per_month, s.status, s.matches_reset_at
  INTO v_current, v_max, v_status, v_reset_at
  FROM public.subscriptions s
  LEFT JOIN public.plans p ON s.plan_id = p.id
  WHERE s.company_id = p_company_id
  FOR UPDATE;

  -- No active subscription found
  IF NOT FOUND OR v_status NOT IN ('active', 'trialing') THEN
    new_count := 0;
    limit_reached := true;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Auto-reset if we crossed into a new month
  IF v_reset_at < date_trunc('month', now()) THEN
    v_current := 0;
    UPDATE public.subscriptions
    SET matches_used_this_month = 0, matches_reset_at = now()
    WHERE company_id = p_company_id;
  END IF;

  -- NULL max = unlimited
  IF v_max IS NULL THEN
    UPDATE public.subscriptions
    SET matches_used_this_month = COALESCE(v_current, 0) + p_amount
    WHERE company_id = p_company_id;

    new_count := COALESCE(v_current, 0) + p_amount;
    limit_reached := false;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Check if adding would exceed limit
  IF COALESCE(v_current, 0) + p_amount > v_max THEN
    new_count := COALESCE(v_current, 0);
    limit_reached := true;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Increment
  UPDATE public.subscriptions
  SET matches_used_this_month = COALESCE(v_current, 0) + p_amount
  WHERE company_id = p_company_id;

  new_count := COALESCE(v_current, 0) + p_amount;
  limit_reached := false;
  RETURN NEXT;
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Monthly counter reset (called by scheduled job)
CREATE OR REPLACE FUNCTION public.reset_monthly_counters()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.subscriptions
  SET matches_used_this_month = 0,
      ai_analyses_used = 0,
      matches_reset_at = now()
  WHERE matches_reset_at < date_trunc('month', now());

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- VIEW: Admin dashboard metrics (avoids N+1 queries)
-- ============================================================
CREATE OR REPLACE VIEW public.admin_client_overview AS
SELECT
  c.id as company_id,
  c.cnpj,
  c.razao_social,
  c.nome_fantasia,
  c.uf,
  c.created_at as company_created_at,
  s.id as subscription_id,
  s.status as subscription_status,
  s.plan_id,
  s.matches_used_this_month,
  s.current_period_end,
  p.slug as plan_slug,
  p.name as plan_name,
  p.price_cents,
  (SELECT COUNT(*) FROM public.users u WHERE u.company_id = c.id AND u.is_active = true) as active_users,
  (SELECT COUNT(*) FROM public.matches m WHERE m.company_id = c.id) as total_matches
FROM public.companies c
LEFT JOIN public.subscriptions s ON s.company_id = c.id
LEFT JOIN public.plans p ON s.plan_id = p.id;
