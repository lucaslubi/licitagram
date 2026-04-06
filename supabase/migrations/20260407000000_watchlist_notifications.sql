-- Enrich existing competitor_watchlist table with notification fields
ALTER TABLE public.competitor_watchlist
  ADD COLUMN IF NOT EXISTS nickname VARCHAR(100),
  ADD COLUMN IF NOT EXISTS notify_on_win BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_on_new_bid BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_activity_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS added_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_watchlist_last_activity
  ON public.competitor_watchlist(competitor_cnpj, last_activity_seen_at);
