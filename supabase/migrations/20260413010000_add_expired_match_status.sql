-- Add 'expired' to matches status constraint
-- Allows auto-healing to mark matches with expired tenders
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_status_check
  CHECK (status IN ('new', 'notified', 'viewed', 'interested', 'applied', 'won', 'lost', 'dismissed', 'expired'));
