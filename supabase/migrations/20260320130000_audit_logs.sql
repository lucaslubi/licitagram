CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  dimension TEXT NOT NULL,
  check_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'warning', 'critical', 'fixed', 'alert_sent')),
  details JSONB,
  fix_applied TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_date ON audit_logs(audit_date);
CREATE INDEX idx_audit_logs_status ON audit_logs(status);

-- Allow service role only
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON audit_logs FOR ALL USING (auth.role() = 'service_role');
