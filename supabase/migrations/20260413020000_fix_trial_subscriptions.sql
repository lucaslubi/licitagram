-- ============================================================
-- FIX: Trial subscriptions missing current_period_start/end
--
-- The trial creation code in company.ts was not setting
-- current_period_start and current_period_end, which caused
-- the dashboard to show "trial expired" for active trials.
-- This migration backfills those columns for existing trials.
-- ============================================================

-- Backfill current_period_start/end for trialing subscriptions that have
-- started_at and expires_at but are missing the period columns.
UPDATE public.subscriptions
SET
  current_period_start = COALESCE(current_period_start, started_at, created_at),
  current_period_end = COALESCE(current_period_end, expires_at, started_at + interval '7 days', created_at + interval '7 days')
WHERE status = 'trialing'
  AND current_period_end IS NULL;

-- Also fix any trials where current_period_end was accidentally left NULL
-- even if current_period_start was set
UPDATE public.subscriptions
SET current_period_end = COALESCE(expires_at, current_period_start + interval '7 days')
WHERE status = 'trialing'
  AND current_period_start IS NOT NULL
  AND current_period_end IS NULL;
