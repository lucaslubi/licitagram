-- Add fornecedor enrichment columns to competitors table
-- These are populated by the fornecedor-enrichment processor
-- using the dadosabertos.compras.gov.br consultarFornecedor endpoint

ALTER TABLE public.competitors ADD COLUMN IF NOT EXISTS cnae_codigo INTEGER;
ALTER TABLE public.competitors ADD COLUMN IF NOT EXISTS cnae_nome TEXT;
ALTER TABLE public.competitors ADD COLUMN IF NOT EXISTS porte TEXT;
ALTER TABLE public.competitors ADD COLUMN IF NOT EXISTS natureza_juridica TEXT;
ALTER TABLE public.competitors ADD COLUMN IF NOT EXISTS uf_fornecedor TEXT;
ALTER TABLE public.competitors ADD COLUMN IF NOT EXISTS municipio_fornecedor TEXT;

-- Index for CNAE-based queries (competitive intelligence by industry)
CREATE INDEX IF NOT EXISTS idx_competitors_cnae ON public.competitors (cnae_codigo);

-- Index for porte (company size) queries
CREATE INDEX IF NOT EXISTS idx_competitors_porte ON public.competitors (porte);

-- Composite index for competitive intelligence queries
CREATE INDEX IF NOT EXISTS idx_competitors_cnpj_cnae ON public.competitors (cnpj, cnae_codigo);
