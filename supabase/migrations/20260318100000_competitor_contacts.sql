-- Add contact columns to competitor_stats for prospecting
ALTER TABLE public.competitor_stats ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.competitor_stats ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE public.competitor_stats ADD COLUMN IF NOT EXISTS municipio TEXT;
ALTER TABLE public.competitor_stats ADD COLUMN IF NOT EXISTS natureza_juridica TEXT;

CREATE INDEX IF NOT EXISTS idx_competitor_stats_email ON competitor_stats (email) WHERE email IS NOT NULL;
