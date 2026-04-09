-- ============================================================
-- Geographic Filters: Target UFs for companies
-- ============================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS target_ufs TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.companies.target_ufs IS 'List of UFs the company is interested in (Empty = All Brazil)';

-- Also ensure min_valor and max_valor are indexed for performance
CREATE INDEX IF NOT EXISTS idx_companies_min_valor ON public.companies(min_valor);
CREATE INDEX IF NOT EXISTS idx_companies_max_valor ON public.companies(max_valor);
