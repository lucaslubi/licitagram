-- Wave 1 — /conta self-service foundation
-- Creates: cancellation_feedback, data_export_jobs, account_deletion_log
-- Adds soft-delete columns to public.users

-- 1. cancellation_feedback
CREATE TABLE IF NOT EXISTS public.cancellation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  reason_detail TEXT,
  retention_offered TEXT,
  retention_accepted BOOLEAN,
  cancelled_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cancellation_feedback_company
  ON public.cancellation_feedback(company_id, cancelled_at DESC);

ALTER TABLE public.cancellation_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cf_read_own" ON public.cancellation_feedback;
CREATE POLICY "cf_read_own" ON public.cancellation_feedback
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "cf_insert_own" ON public.cancellation_feedback;
CREATE POLICY "cf_insert_own" ON public.cancellation_feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
              AND company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "cf_admin" ON public.cancellation_feedback;
CREATE POLICY "cf_admin" ON public.cancellation_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. data_export_jobs
CREATE TABLE IF NOT EXISTS public.data_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed','expired')),
  storage_path TEXT,
  signed_url_expires_at TIMESTAMPTZ,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_data_export_jobs_user
  ON public.data_export_jobs(user_id, requested_at DESC);

ALTER TABLE public.data_export_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dej_read_own" ON public.data_export_jobs;
CREATE POLICY "dej_read_own" ON public.data_export_jobs
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "dej_insert_own" ON public.data_export_jobs;
CREATE POLICY "dej_insert_own" ON public.data_export_jobs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "dej_admin" ON public.data_export_jobs;
CREATE POLICY "dej_admin" ON public.data_export_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. account_deletion_log
CREATE TABLE IF NOT EXISTS public.account_deletion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID,
  scheduled_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  reason TEXT,
  metadata JSONB
);
CREATE INDEX IF NOT EXISTS idx_adl_scheduled
  ON public.account_deletion_log(scheduled_at)
  WHERE executed_at IS NULL;

-- 4. Soft-delete columns on public.users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT,
  ADD COLUMN IF NOT EXISTS deletion_cancelled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_deletion_scheduled
  ON public.users(deletion_scheduled_at)
  WHERE deletion_scheduled_at IS NOT NULL AND deletion_cancelled_at IS NULL;
