-- System Metrics — time-series storage for monitoring dashboard
-- Stores periodic snapshots of queue depths, worker stats, VPS metrics, and DB counts.
-- The monitoring worker writes rows periodically; the admin dashboard reads them for charts.

CREATE TABLE IF NOT EXISTS system_metrics (
  id bigserial PRIMARY KEY,
  metric_type text NOT NULL,       -- 'queue', 'worker', 'vps', 'database'
  metric_name text NOT NULL,       -- e.g. 'extraction_wait', 'ram_used', 'tenders_count'
  metric_value numeric NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- Fast lookups by type + time (for dashboard filtering)
CREATE INDEX IF NOT EXISTS idx_system_metrics_type_time
  ON system_metrics(metric_type, recorded_at DESC);

-- Fast lookups by name + time (for individual metric charts)
CREATE INDEX IF NOT EXISTS idx_system_metrics_name_time
  ON system_metrics(metric_name, recorded_at DESC);

-- RLS: only service role can read/write (admin API uses service role key)
ALTER TABLE system_metrics ENABLE ROW LEVEL SECURITY;

-- No RLS policies = only service_role can access (exactly what we want)
-- The Vercel API route uses SUPABASE_SERVICE_ROLE_KEY to query this table.

COMMENT ON TABLE system_metrics IS 'Time-series metrics for admin monitoring dashboard. Auto-cleanup of rows older than 7 days is handled by the metrics worker.';
