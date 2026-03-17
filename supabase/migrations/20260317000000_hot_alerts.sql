-- Hot Alerts: Mark top daily opportunities and track urgency notifications
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS is_hot BOOLEAN DEFAULT false;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS hot_at TIMESTAMPTZ;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS urgency_48h_sent BOOLEAN DEFAULT false;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS urgency_24h_sent BOOLEAN DEFAULT false;

-- Partial index for fast hot marker queries (only true rows)
CREATE INDEX IF NOT EXISTS idx_matches_is_hot ON public.matches (is_hot) WHERE is_hot = true;

-- Index for urgency check: find matches by company with active statuses
CREATE INDEX IF NOT EXISTS idx_matches_urgency ON public.matches (company_id, status)
  WHERE status IN ('new', 'notified', 'viewed', 'interested');
