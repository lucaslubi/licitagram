-- ============================================================
-- AUDIT LOG: Track all administrative actions
-- Required for compliance and security monitoring
-- ============================================================

CREATE TABLE public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,           -- e.g. 'plan.created', 'user.deactivated', 'tenant.status_changed'
  target_type TEXT,               -- 'plan', 'user', 'company', 'subscription', 'admin'
  target_id TEXT,                 -- UUID of the affected entity
  details JSONB DEFAULT '{}'::jsonb,  -- before/after values, context
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for common query patterns
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_target ON public.audit_logs(target_type, target_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- Composite index for filtered + sorted queries in admin panel
CREATE INDEX idx_audit_logs_type_created ON public.audit_logs(target_type, created_at DESC);

-- RLS: Only platform admins can read audit logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
  FOR SELECT USING (public.is_platform_admin());

-- Insert: platform admins can write audit logs (service_role also bypasses RLS)
CREATE POLICY "audit_logs_insert_admin" ON public.audit_logs
  FOR INSERT WITH CHECK (public.is_platform_admin());
