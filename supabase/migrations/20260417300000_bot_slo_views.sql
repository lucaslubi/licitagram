-- LICITAGRAM SUPREME BOT — SLO views.
--
-- Powers the public status page and the `/api/v1/bot/status` endpoint
-- with three read-optimized views:
--
--   bot_latency_stats_24h   — p50/p95/p99 of our_bid_ack latency_ms over
--                             the last 24 h, grouped by portal.
--   bot_portal_health_24h   — per-portal success ratio over the last 24 h.
--   bot_webhook_health_24h  — delivery success ratio + p95 attempt count.
--
-- All three are simple views (not materialized) so they always reflect
-- current data. If volume becomes a concern we materialize + refresh
-- with pg_cron every 1 min — trivial migration later.

CREATE OR REPLACE VIEW public.bot_latency_stats_24h AS
SELECT
  COALESCE(s.portal, 'unknown')                 AS portal,
  COUNT(*) FILTER (WHERE e.latency_ms IS NOT NULL) AS sample_size,
  PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY e.latency_ms) AS p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY e.latency_ms) AS p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY e.latency_ms) AS p99_ms,
  MIN(e.latency_ms) AS min_ms,
  MAX(e.latency_ms) AS max_ms
FROM public.bot_events e
JOIN public.bot_sessions s ON s.id = e.session_id
WHERE e.kind = 'our_bid_ack'
  AND e.latency_ms IS NOT NULL
  AND e.occurred_at >= NOW() - INTERVAL '24 hours'
GROUP BY s.portal;

COMMENT ON VIEW public.bot_latency_stats_24h IS
  'p50/p95/p99 of our_bid_ack latency per portal over the last 24h. '
  'Powers the public SLO dashboard.';

CREATE OR REPLACE VIEW public.bot_portal_health_24h AS
SELECT
  s.portal,
  COUNT(*)                                    AS total_sessions,
  COUNT(*) FILTER (WHERE s.status = 'completed') AS completed_sessions,
  COUNT(*) FILTER (WHERE s.status = 'failed')    AS failed_sessions,
  COUNT(*) FILTER (WHERE s.status IN ('active','pending')) AS live_sessions,
  ROUND(
    (COUNT(*) FILTER (WHERE s.status = 'completed')::numeric
      / NULLIF(COUNT(*) FILTER (WHERE s.status IN ('completed','failed')), 0))
    * 100, 2
  ) AS success_ratio_pct
FROM public.bot_sessions s
WHERE s.created_at >= NOW() - INTERVAL '24 hours'
GROUP BY s.portal;

COMMENT ON VIEW public.bot_portal_health_24h IS
  'Per-portal health: total/completed/failed/live sessions and success ratio.';

CREATE OR REPLACE VIEW public.bot_webhook_health_24h AS
SELECT
  COUNT(*)                                           AS total_deliveries,
  COUNT(*) FILTER (WHERE delivered_at IS NOT NULL)   AS delivered,
  COUNT(*) FILTER (WHERE delivered_at IS NULL
                    AND next_retry_at IS NOT NULL)   AS pending_retry,
  COUNT(*) FILTER (WHERE delivered_at IS NULL
                    AND next_retry_at IS NULL)       AS permanently_failed,
  ROUND(
    (COUNT(*) FILTER (WHERE delivered_at IS NOT NULL)::numeric
      / NULLIF(COUNT(*), 0))
    * 100, 2
  ) AS delivery_ratio_pct,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY attempt_count) AS p95_attempts
FROM public.bot_webhook_deliveries
WHERE created_at >= NOW() - INTERVAL '24 hours';

COMMENT ON VIEW public.bot_webhook_health_24h IS
  'Webhook delivery health over the last 24h (total, delivered, pending retry, failed) + p95 attempts.';

-- Grant SELECT to authenticated + anon so the public status endpoint can
-- read them via the service role (RLS does not apply to views; these
-- views INTENTIONALLY do not expose company-scoped data, only aggregates).
GRANT SELECT ON public.bot_latency_stats_24h TO anon, authenticated;
GRANT SELECT ON public.bot_portal_health_24h TO anon, authenticated;
GRANT SELECT ON public.bot_webhook_health_24h TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
