-- ============================================================
-- ROBUSTNESS FIXES: Migration 7
-- Fixes critical issues found during code audit
-- ============================================================

-- ============================================================
-- 1. FIX: orgao_cnpj NOT NULL → nullable
--    BEC SP, Portal MG, and some dadosabertos entries do NOT
--    have a CNPJ for the buyer org. The NOT NULL constraint
--    will cause ALL inserts from these sources to FAIL.
-- ============================================================
ALTER TABLE public.tenders ALTER COLUMN orgao_cnpj DROP NOT NULL;

-- ============================================================
-- 2. FIX: competitors table has NO RLS policies
--    Currently anyone authenticated can see all competitors.
--    Should be readable by all auth users (competitive intel),
--    but only writable via service_role (workers).
-- ============================================================
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read competitors (public competitive intelligence)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'competitors_select_authenticated' AND tablename = 'competitors'
  ) THEN
    CREATE POLICY "competitors_select_authenticated" ON public.competitors
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ============================================================
-- 3. FIX: scraping_jobs.job_type constraint too restrictive
--    New job types: 'document_expiry', 'enrichment', 'results',
--    'arp', 'legado', 'bec_sp', 'compras_mg', 'comprasgov'
-- ============================================================
ALTER TABLE public.scraping_jobs DROP CONSTRAINT IF EXISTS scraping_jobs_job_type_check;
ALTER TABLE public.scraping_jobs ADD CONSTRAINT scraping_jobs_job_type_check
  CHECK (job_type IN (
    'scrape', 'extract', 'match', 'notify',
    'document_expiry', 'enrichment', 'results',
    'arp', 'legado', 'bec_sp', 'compras_mg', 'comprasgov'
  ));

-- ============================================================
-- 4. INDEXES: Missing indexes for new query patterns
-- ============================================================

-- Historical prices: queries tenders with valor_estimado NOT NULL + ilike on objeto
-- Partial index speeds up the NOT NULL filter used by historical-prices.tsx
CREATE INDEX IF NOT EXISTS idx_tenders_valor_estimado_not_null
  ON public.tenders (data_abertura DESC)
  WHERE valor_estimado IS NOT NULL;

-- valor_homologado filter for competitive intelligence
CREATE INDEX IF NOT EXISTS idx_tenders_valor_homologado
  ON public.tenders (valor_homologado)
  WHERE valor_homologado IS NOT NULL;

-- Competitors: tender_id lookup (used by results-scraping processor)
CREATE INDEX IF NOT EXISTS idx_competitors_tender_id ON public.competitors (tender_id);

-- Compound index for match queries with score filtering
CREATE INDEX IF NOT EXISTS idx_matches_company_score
  ON public.matches (company_id, score DESC);

-- Index for tender data_abertura (used extensively in UI sorting)
CREATE INDEX IF NOT EXISTS idx_tenders_data_abertura
  ON public.tenders (data_abertura DESC NULLS LAST);

-- Index for tenders by orgao_cnpj (used in dedup for comprasgov)
CREATE INDEX IF NOT EXISTS idx_tenders_orgao_cnpj
  ON public.tenders (orgao_cnpj)
  WHERE orgao_cnpj IS NOT NULL;

-- ============================================================
-- 5. FIX: company_documents needs UPDATE trigger for updated_at
--    (already handled by migration 4, but ensure function exists)
-- ============================================================
-- This is idempotent - safe to re-run
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 6. FIX: Missing INSERT policy on users table
--    The handle_new_user trigger runs as SECURITY DEFINER so
--    it bypasses RLS, but direct user updates from the app
--    (like setting telegram_chat_id) need UPDATE policy.
--    The existing one only checks auth.uid() = id which is correct.
--    But we also need users to be able to insert their own record
--    in edge cases (e.g., if the trigger failed).
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'users_insert_own' AND tablename = 'users'
  ) THEN
    CREATE POLICY "users_insert_own" ON public.users
      FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- ============================================================
-- 7. FIX: Missing UPDATE policy on competitor_watchlist
--    Users can view, insert, and delete but NOT update their watchlist
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own watchlist' AND tablename = 'competitor_watchlist'
  ) THEN
    CREATE POLICY "Users can update own watchlist" ON public.competitor_watchlist
      FOR UPDATE USING (
        company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 8. SAFETY: Ensure pg_trgm extension is enabled
--    (already in initial migration, but be explicit)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- 9. FIX: Add index for subscription lookups
--    billing/page.tsx queries subscriptions by company_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON public.subscriptions (status);

-- ============================================================
-- 10. PERFORMANCE: Add index on tender_documents.tender_id
--     for JOIN performance in chat and extraction queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tender_docs_tender_id
  ON public.tender_documents (tender_id);

-- ============================================================
-- 11. FIX: Add default for source column on existing rows
--     Make sure all NULL sources are set to 'pncp'
-- ============================================================
UPDATE public.tenders SET source = 'pncp' WHERE source IS NULL;
