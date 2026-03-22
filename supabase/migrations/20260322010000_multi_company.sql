-- ============================================================
-- MULTI-COMPANY SUPPORT (Enterprise feature)
-- ============================================================
-- Allows Enterprise users to manage multiple companies/CNPJs
-- under a single account.

-- ─── 1. user_companies junction table ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'user', 'viewer')),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, company_id)
);

CREATE INDEX idx_user_companies_user ON public.user_companies(user_id);
CREATE INDEX idx_user_companies_company ON public.user_companies(company_id);

-- ─── 2. Add max_companies to plans table (if plans table exists) ────────────
-- Plans are stored as JSONB features on subscriptions, so we add the limit
-- as a column on companies or check in application code.
-- We add a max_companies column to subscriptions to track per-subscription limits.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'max_companies'
  ) THEN
    ALTER TABLE public.subscriptions ADD COLUMN max_companies INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

-- ─── 3. Add is_active and onboarding columns if missing on users ────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- ─── 4. Backfill: create user_companies rows for existing users ─────────────
-- Every user with a company_id gets linked via user_companies

INSERT INTO public.user_companies (user_id, company_id, role, is_default)
SELECT u.id, u.company_id, COALESCE(u.role, 'admin'), true
FROM public.users u
WHERE u.company_id IS NOT NULL
ON CONFLICT (user_id, company_id) DO NOTHING;

-- ─── 5. RLS for user_companies ──────────────────────────────────────────────

ALTER TABLE public.user_companies ENABLE ROW LEVEL SECURITY;

-- Users can see their own company links
CREATE POLICY "user_companies_select_own" ON public.user_companies
  FOR SELECT USING (user_id = auth.uid());

-- Users can insert their own company links
CREATE POLICY "user_companies_insert_own" ON public.user_companies
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can delete their own company links
CREATE POLICY "user_companies_delete_own" ON public.user_companies
  FOR DELETE USING (user_id = auth.uid());

-- Users can update their own company links (e.g., set is_default)
CREATE POLICY "user_companies_update_own" ON public.user_companies
  FOR UPDATE USING (user_id = auth.uid());

-- Platform admins can see all user_companies
CREATE POLICY "platform_admin_user_companies_select" ON public.user_companies
  FOR SELECT USING (public.is_platform_admin());

-- ─── 6. Update companies RLS to also allow access via user_companies ────────
-- Drop old policies and recreate with user_companies support

DROP POLICY IF EXISTS "companies_select_own" ON public.companies;
CREATE POLICY "companies_select_own" ON public.companies
  FOR SELECT USING (
    id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
    OR
    id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "companies_update_own" ON public.companies;
CREATE POLICY "companies_update_own" ON public.companies
  FOR UPDATE USING (
    id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
    OR
    id IN (SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid() AND uc.role = 'admin')
  );
