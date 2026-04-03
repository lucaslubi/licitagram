-- ============================================================
-- Feature 3: Impugnação de Edital
-- ============================================================

CREATE TABLE IF NOT EXISTS public.impugnations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  tender_id UUID REFERENCES public.tenders(id) ON DELETE CASCADE NOT NULL,
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
  motivo TEXT NOT NULL,
  fundamentacao TEXT NOT NULL,
  texto_completo TEXT NOT NULL,
  prazo_limite TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected')),
  storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.impugnations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own impugnations" ON public.impugnations
  FOR ALL USING (company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_impugnations_company ON public.impugnations(company_id);
CREATE INDEX IF NOT EXISTS idx_impugnations_tender ON public.impugnations(tender_id);
