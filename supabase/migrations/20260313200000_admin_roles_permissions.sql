-- ============================================================
-- ADMIN ROLES & PERMISSIONS
-- Separates platform admin (global) from tenant role (per-company)
-- ============================================================

-- Platform admin flag (orthogonal to tenant role)
-- A user can be role='user' in their company but is_platform_admin=true
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN DEFAULT false;

-- Granular admin permissions (which admin panel sections they can access)
-- Example: {"dashboard": true, "clients": true, "plans": false, "users": true, "financial": false, "admins": false, "audit": true}
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS admin_permissions JSONB DEFAULT NULL;

-- User active status (for deactivation without deletion)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Index for platform admin lookups
CREATE INDEX IF NOT EXISTS idx_users_platform_admin ON public.users(is_platform_admin) WHERE is_platform_admin = true;
CREATE INDEX IF NOT EXISTS idx_users_active ON public.users(is_active);

-- ============================================================
-- RLS: Platform admins can see/update ALL data across tenants
-- These policies are additive (OR) with existing per-tenant policies
-- ============================================================

-- Helper function to check platform admin status (avoids repeated subquery)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_platform_admin = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Users: platform admins see all users
CREATE POLICY "platform_admin_users_select" ON public.users
  FOR SELECT USING (public.is_platform_admin());

CREATE POLICY "platform_admin_users_update" ON public.users
  FOR UPDATE USING (public.is_platform_admin());

-- Companies: platform admins see all companies
CREATE POLICY "platform_admin_companies_select" ON public.companies
  FOR SELECT USING (public.is_platform_admin());

CREATE POLICY "platform_admin_companies_update" ON public.companies
  FOR UPDATE USING (public.is_platform_admin());

-- Subscriptions: platform admins see/manage all subscriptions
CREATE POLICY "platform_admin_subscriptions_select" ON public.subscriptions
  FOR SELECT USING (public.is_platform_admin());

CREATE POLICY "platform_admin_subscriptions_update" ON public.subscriptions
  FOR UPDATE USING (public.is_platform_admin());

CREATE POLICY "platform_admin_subscriptions_insert" ON public.subscriptions
  FOR INSERT WITH CHECK (public.is_platform_admin());

-- Matches: platform admins see all matches
CREATE POLICY "platform_admin_matches_select" ON public.matches
  FOR SELECT USING (public.is_platform_admin());

-- ============================================================
-- SEED: Mark the first registered user as platform admin
-- (The platform owner who set up the system)
-- ============================================================
UPDATE public.users
SET is_platform_admin = true,
    admin_permissions = '{"dashboard": true, "clients": true, "plans": true, "users": true, "financial": true, "admins": true, "audit": true}'::jsonb
WHERE id = (SELECT id FROM public.users ORDER BY created_at ASC LIMIT 1);
