-- Add source column to tenders for multi-portal support
ALTER TABLE public.tenders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'pncp';

-- Create company_documents table for certidão/document tracking
CREATE TABLE IF NOT EXISTS public.company_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  tipo TEXT NOT NULL, -- 'cnd_federal', 'cnd_estadual', 'cnd_municipal', 'fgts', 'trabalhista', 'cndt', 'atestado_capacidade', 'iso_9001', 'sicaf', etc
  descricao TEXT,
  numero TEXT,
  validade DATE, -- expiration date
  arquivo_url TEXT,
  status TEXT DEFAULT 'valido' CHECK (status IN ('valido', 'vencendo', 'vencido')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create competitor_watchlist for competitive intelligence
CREATE TABLE IF NOT EXISTS public.competitor_watchlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  competitor_cnpj VARCHAR(14) NOT NULL,
  competitor_nome TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, competitor_cnpj)
);

-- Index for source filtering
CREATE INDEX IF NOT EXISTS idx_tenders_source ON public.tenders (source);

-- Index for full-text search on tender_documents text
CREATE INDEX IF NOT EXISTS idx_tender_docs_texto_trgm ON public.tender_documents USING GIN (texto_extraido gin_trgm_ops);

-- Index for company_documents queries
CREATE INDEX IF NOT EXISTS idx_company_docs_company ON public.company_documents (company_id);
CREATE INDEX IF NOT EXISTS idx_company_docs_validade ON public.company_documents (validade);

-- Index for competitor_watchlist
CREATE INDEX IF NOT EXISTS idx_competitor_watchlist_company ON public.competitor_watchlist (company_id);

-- Index for competitors by cnpj
CREATE INDEX IF NOT EXISTS idx_competitors_cnpj ON public.competitors (cnpj);

-- RLS for company_documents
ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own company documents" ON public.company_documents
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
  );
CREATE POLICY "Users can insert own company documents" ON public.company_documents
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
  );
CREATE POLICY "Users can update own company documents" ON public.company_documents
  FOR UPDATE USING (
    company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
  );
CREATE POLICY "Users can delete own company documents" ON public.company_documents
  FOR DELETE USING (
    company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
  );

-- RLS for competitor_watchlist
ALTER TABLE public.competitor_watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own watchlist" ON public.competitor_watchlist
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
  );
CREATE POLICY "Users can insert own watchlist" ON public.competitor_watchlist
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
  );
CREATE POLICY "Users can delete own watchlist" ON public.competitor_watchlist
  FOR DELETE USING (
    company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
  );

-- Trigger for updated_at on company_documents
CREATE TRIGGER handle_company_documents_updated_at
  BEFORE UPDATE ON public.company_documents
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
