-- Certidão jobs table for async Puppeteer-based certidão fetching
CREATE TABLE IF NOT EXISTS public.certidao_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cnpj TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  progress JSONB DEFAULT '{}',
  result_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_certidao_jobs_pending ON public.certidao_jobs(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_certidao_jobs_company ON public.certidao_jobs(company_id);

-- RLS
ALTER TABLE public.certidao_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company jobs"
  ON public.certidao_jobs FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM public.users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert own company jobs"
  ON public.certidao_jobs FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM public.users WHERE id = auth.uid()
  ));
