-- LICITAGRAM BOT — Forensic Replay
--
-- Adds the storage needed for the feature no competitor has: a full,
-- scrub-able timeline of everything the bot observed and did during a
-- pregão. When a client says "why did I lose?", we can replay the
-- auction tick-by-tick with latency and competitor bids.
--
-- Design:
--   - bot_events is append-only (no updates). One row per observable thing.
--   - Every row has `session_id` + `occurred_at` (monotonic ms since session start).
--   - `kind` tags the event so the UI can render the right lane in the
--     timeline (our bid, rival bid, phase change, chat, latency sample, etc.).
--   - `payload` is a JSONB with shape specific to the `kind`.
--   - Partitioned by created_at WEEK via a plain index (not declarative
--     partitioning — we stay flexible; migrate to TimescaleDB if ingest volume
--     blows past 10k events/s).
--   - RLS matches bot_sessions visibility via a subquery policy.
--
-- The new bot_actions.action_type `tick` was added in Phase 0. bot_events
-- is a distinct, higher-volume table: one row per observation, not one row
-- per interaction. Actions stay for human-readable audit; events are for
-- machine replay.

-- ─── Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bot_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES public.bot_sessions(id) ON DELETE CASCADE,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Monotonic ms since session start. Convenient for the UI scrubber.
  t_ms         INTEGER NOT NULL DEFAULT 0,
  kind         TEXT NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  latency_ms   INTEGER
);

COMMENT ON TABLE public.bot_events IS
  'Append-only event log for bot forensic replay. One row per observation.';
COMMENT ON COLUMN public.bot_events.kind IS
  'Event kind: tick, our_bid, rival_bid, phase_change, chat_msg, floor_update, '
  'login_refresh, captcha_solved, websocket_message, error, snapshot.';
COMMENT ON COLUMN public.bot_events.t_ms IS
  'Monotonic ms since bot_sessions.started_at for timeline scrubber.';
COMMENT ON COLUMN public.bot_events.payload IS
  'Shape is kind-specific. For rival_bid: {valor, ranking, source}; '
  'for tick: {fase, melhor_lance, nossa_posicao, nosso_lance}; '
  'for our_bid: {valor, step, triggered_by, ack}; etc.';
COMMENT ON COLUMN public.bot_events.latency_ms IS
  'Round-trip ms for events that involved a remote call (our_bid ack, '
  'websocket_message debounce, etc.).';

-- CHECK on kind — enforced at write time, extended when we add new lanes.
ALTER TABLE public.bot_events ADD CONSTRAINT bot_events_kind_check
  CHECK (kind IN (
    'tick','our_bid','our_bid_ack','our_bid_nack','our_bid_attempt',
    'rival_bid','rival_overtook_us','we_overtook_rival',
    'phase_change','phase_random_started','phase_encerrado','phase_homologado',
    'chat_msg','floor_update','floor_set',
    'login_refresh','login_expired','captcha_solved','captcha_failed',
    'websocket_message','websocket_open','websocket_close',
    'heartbeat','snapshot','error',
    'supervisor_handoff','auto_bid_handoff','shadow_observation'
  ));

-- ─── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS bot_events_session_time_idx
  ON public.bot_events (session_id, occurred_at);

CREATE INDEX IF NOT EXISTS bot_events_session_kind_idx
  ON public.bot_events (session_id, kind, occurred_at);

-- GIN on payload for post-hoc analytics ("find every auction where a rival
-- bid landed within 50ms of our ack").
CREATE INDEX IF NOT EXISTS bot_events_payload_gin_idx
  ON public.bot_events USING GIN (payload jsonb_path_ops);

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.bot_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own bot events"
  ON public.bot_events FOR SELECT
  USING (session_id IN (
    SELECT id FROM public.bot_sessions WHERE company_id IN (
      SELECT company_id FROM public.users WHERE id = auth.uid()
    )
  ));

-- Only workers (service role) and the UI bid-submitter write events. Users
-- do NOT insert directly.

-- ─── Reload ─────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
