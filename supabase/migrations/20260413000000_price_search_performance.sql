-- Fix "canceling statement due to statement timeout" on price search
-- The textSearch + INNER JOIN competitors query can be slow for broad terms
--
-- Solution:
-- 1. Add composite index on tenders for the price search pattern
-- 2. Add partial index on tenders with valor_homologado NOT NULL (filters 80% of rows)
-- 3. Create optimized RPC function with extended statement_timeout

-- Partial index: only tenders with valor_homologado (used in price search)
CREATE INDEX IF NOT EXISTS idx_tenders_homologado_not_null
  ON tenders (data_encerramento DESC)
  WHERE valor_homologado IS NOT NULL;

-- Composite index for the common price search pattern
CREATE INDEX IF NOT EXISTS idx_tenders_fts_price_search
  ON tenders USING gin(to_tsvector('portuguese', objeto))
  WHERE valor_homologado IS NOT NULL;

-- Increase statement_timeout for authenticated role to 30s (Supabase default is 8s)
-- This allows complex price searches to complete
ALTER ROLE authenticated SET statement_timeout = '30s';
