-- LICITAGRAM BOT — Phase 0 Hardening
--
-- Fixes critical schema gaps that cause silent failures in production:
--
--   1. ENCRYPTION: add bytea columns for password + cookies ciphertext.
--      Keeps legacy `password_hash` / `cookies` TEXT columns for a short
--      backward-compat window during migration. A later migration will drop
--      them once the one-shot encryption migrator has run over existing rows.
--
--   2. MISSING COLUMNS referenced by worker code but never created:
--        bot_sessions.bids_placed      — runner writes this every tick
--        bot_sessions.current_price    — runner writes this every tick
--        bot_sessions.last_heartbeat   — for the watchdog that reaps
--                                        zombie 'active' sessions after crash
--        bot_sessions.error_count      — for exponential back-off
--        bot_sessions.idempotency_key  — prevents double-session creation
--
--   3. STATUS CHECK: add 'cancelled' (the PATCH endpoint writes it, but the
--      existing CHECK rejects it — every cancel 500s in production today).
--
--   4. BOT_ACTIONS idempotency + new action types for audit trail.
--
-- NOTE: This is the SCHEMA migration only. The application-level ciphertext
-- write path is added in this same PR (see /api/bot/config route). The
-- one-shot backfill script for existing plaintext rows is a separate file
-- (packages/workers/src/bot/scripts/migrate-plaintext-passwords.ts).

-- ─── 1. Encryption columns ──────────────────────────────────────────────────

ALTER TABLE public.bot_configs
  ADD COLUMN IF NOT EXISTS password_cipher BYTEA,
  ADD COLUMN IF NOT EXISTS password_nonce  BYTEA,
  ADD COLUMN IF NOT EXISTS cookies_cipher  BYTEA,
  ADD COLUMN IF NOT EXISTS cookies_nonce   BYTEA;

COMMENT ON COLUMN public.bot_configs.password_cipher IS
  'AES-256-GCM ciphertext of the portal password. Nonce in password_nonce (iv 12B || tag 16B = 28B).';
COMMENT ON COLUMN public.bot_configs.cookies_cipher IS
  'AES-256-GCM ciphertext of the session storage_state JSON. Nonce in cookies_nonce.';
COMMENT ON COLUMN public.bot_configs.password_hash IS
  'DEPRECATED — plaintext password kept only for backward compatibility. To be dropped after '
  'migrate-plaintext-passwords.ts completes on all rows. NEVER trust for new writes.';

-- ─── 2. Missing columns on bot_sessions ─────────────────────────────────────

ALTER TABLE public.bot_sessions
  ADD COLUMN IF NOT EXISTS bids_placed       INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_price     NUMERIC,
  ADD COLUMN IF NOT EXISTS last_heartbeat    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_count       INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idempotency_key   TEXT,
  ADD COLUMN IF NOT EXISTS mode              TEXT        NOT NULL DEFAULT 'supervisor',
  ADD COLUMN IF NOT EXISTS worker_id         TEXT,
  ADD COLUMN IF NOT EXISTS locked_until      TIMESTAMPTZ;

COMMENT ON COLUMN public.bot_sessions.mode IS
  'Execution mode. "supervisor" = set floor in the portal native auto-bidder and monitor; '
  '"auto_bid" = we submit lances directly via browser automation. Default supervisor (safer, legal).';

COMMENT ON COLUMN public.bot_sessions.last_heartbeat IS
  'Updated every tick by the active worker. Watchdog reaps sessions stale > 5 min.';

COMMENT ON COLUMN public.bot_sessions.idempotency_key IS
  'Client-supplied key to dedupe POST /api/bot/sessions. UNIQUE per company.';

COMMENT ON COLUMN public.bot_sessions.worker_id IS
  'Hostname:pid of the worker currently holding the lock. Used with locked_until for distributed '
  'coordination — replaces the DB-polling race.';

CREATE UNIQUE INDEX IF NOT EXISTS bot_sessions_idempotency_key_uniq
  ON public.bot_sessions (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS bot_sessions_watchdog_idx
  ON public.bot_sessions (status, last_heartbeat)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS bot_sessions_locked_until_idx
  ON public.bot_sessions (locked_until)
  WHERE status IN ('pending','active');

-- ─── 3. Status CHECK: add 'cancelled' ───────────────────────────────────────

ALTER TABLE public.bot_sessions DROP CONSTRAINT IF EXISTS bot_sessions_status_check;
ALTER TABLE public.bot_sessions ADD CONSTRAINT bot_sessions_status_check
  CHECK (status IN ('pending','active','paused','completed','failed','cancelled'));

-- ─── 4. Mode CHECK ──────────────────────────────────────────────────────────

ALTER TABLE public.bot_sessions ADD CONSTRAINT bot_sessions_mode_check
  CHECK (mode IN ('supervisor','auto_bid','shadow'));

-- ─── 5. bot_actions: idempotency + expanded action types ────────────────────

ALTER TABLE public.bot_actions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS latency_ms      INTEGER;

COMMENT ON COLUMN public.bot_actions.idempotency_key IS
  'Per-session unique key for bid actions. Prevents double-log on retry storms.';

COMMENT ON COLUMN public.bot_actions.latency_ms IS
  'Round-trip ms for this action (e.g., time from trigger to portal ack for a bid).';

CREATE UNIQUE INDEX IF NOT EXISTS bot_actions_idempotency_uniq
  ON public.bot_actions (session_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Expand action_type to cover the full lifecycle the new worker will emit.
ALTER TABLE public.bot_actions DROP CONSTRAINT IF EXISTS bot_actions_action_type_check;
ALTER TABLE public.bot_actions ADD CONSTRAINT bot_actions_action_type_check
  CHECK (action_type IN (
    -- legacy
    'login','search','bid','message','error','completed',
    -- already added in 210000
    'login_attempt','login_success','price_fetch_failed','price_error','bid_calc_error',
    'bid_below_min','skip_round','session_start','session_completed','session_failed',
    'session_stopped','strategy_configured',
    -- phase 0 additions
    'bid_submitted','bid_acknowledged','bid_rejected','bid_won','bid_lost',
    'floor_set','floor_updated',
    'captcha_solved','captcha_failed',
    'heartbeat','watchdog_reaped','session_resumed',
    'competitor_overtook','our_bid_best','phase_changed',
    'supervisor_activated','auto_bid_activated'
  ));

-- ─── 6. Reload PostgREST schema cache ───────────────────────────────────────

NOTIFY pgrst, 'reload schema';

-- Down migration (manual, commented):
--   ALTER TABLE public.bot_configs
--     DROP COLUMN password_cipher, DROP COLUMN password_nonce,
--     DROP COLUMN cookies_cipher,  DROP COLUMN cookies_nonce;
--   ALTER TABLE public.bot_sessions
--     DROP COLUMN bids_placed, DROP COLUMN current_price, DROP COLUMN last_heartbeat,
--     DROP COLUMN error_count, DROP COLUMN idempotency_key, DROP COLUMN mode,
--     DROP COLUMN worker_id, DROP COLUMN locked_until;
--   DROP INDEX IF EXISTS bot_sessions_idempotency_key_uniq;
--   DROP INDEX IF EXISTS bot_sessions_watchdog_idx;
--   DROP INDEX IF EXISTS bot_sessions_locked_until_idx;
--   ALTER TABLE public.bot_actions
--     DROP COLUMN idempotency_key, DROP COLUMN latency_ms;
--   DROP INDEX IF EXISTS bot_actions_idempotency_uniq;
