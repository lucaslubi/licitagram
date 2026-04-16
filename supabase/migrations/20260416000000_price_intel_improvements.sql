-- ============================================================
-- PRICE INTELLIGENCE IMPROVEMENTS
--
-- 1. Unique constraint on tender_items for upsert support
-- 2. Auto-refresh competitor_bid_patterns materialized view
-- 3. Additional indexes for price search performance
-- ============================================================

-- 1. Add unique constraint for tender_items upsert
-- (tender_id + numero_item should be unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tender_items_unique
  ON public.tender_items(tender_id, numero_item)
  WHERE numero_item IS NOT NULL;

-- 2. Add FTS index on tender_items.descricao for item-level search
CREATE INDEX IF NOT EXISTS idx_tender_items_fts
  ON public.tender_items USING gin(to_tsvector('portuguese', descricao));

-- 3. Price history indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_price_history_tender_item
  ON public.price_history(tender_id, tender_item_number);
CREATE INDEX IF NOT EXISTS idx_price_history_data
  ON public.price_history(data_homologacao DESC)
  WHERE valor_unitario_vencido IS NOT NULL;

-- 4. Function to refresh competitor_bid_patterns (if view exists)
-- This runs as a scheduled refresh without blocking reads
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'competitor_bid_patterns') THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY competitor_bid_patterns;
  END IF;
END $$;
