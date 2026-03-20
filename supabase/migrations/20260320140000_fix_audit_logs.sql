-- Fix audit_logs table: add audit_date column if missing, add evolution tracking columns
DO $$
BEGIN
  -- Add audit_date if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'audit_date'
  ) THEN
    ALTER TABLE audit_logs ADD COLUMN audit_date DATE NOT NULL DEFAULT CURRENT_DATE;
    CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(audit_date);
  END IF;

  -- Add evolution tracking columns for autonomous learning
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'recurrence_count'
  ) THEN
    ALTER TABLE audit_logs ADD COLUMN recurrence_count INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'auto_resolved'
  ) THEN
    ALTER TABLE audit_logs ADD COLUMN auto_resolved BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'resolution_time_ms'
  ) THEN
    ALTER TABLE audit_logs ADD COLUMN resolution_time_ms INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'evolution_action'
  ) THEN
    ALTER TABLE audit_logs ADD COLUMN evolution_action TEXT;
  END IF;
END $$;

-- System evolution history table: tracks all autonomous improvements
CREATE TABLE IF NOT EXISTS system_evolution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evolution_type TEXT NOT NULL CHECK (evolution_type IN (
    'auto_fix', 'optimization', 'pattern_prevention', 'config_tuning', 'cleanup', 'scaling'
  )),
  description TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  trigger_source TEXT NOT NULL, -- 'daily_audit', 'pattern_detection', 'threshold_breach'
  success BOOLEAN DEFAULT TRUE,
  metrics_before JSONB,
  metrics_after JSONB,
  recurring_issue_id TEXT, -- links to recurring pattern
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_evolution_type ON system_evolution(evolution_type);
CREATE INDEX IF NOT EXISTS idx_system_evolution_created ON system_evolution(created_at DESC);

ALTER TABLE system_evolution ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON system_evolution FOR ALL USING (auth.role() = 'service_role');

-- Recurring issues tracking
CREATE TABLE IF NOT EXISTS recurring_issues (
  id TEXT PRIMARY KEY, -- hash of dimension + check_name
  dimension TEXT NOT NULL,
  check_name TEXT NOT NULL,
  occurrence_count INTEGER DEFAULT 1,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  last_fix_applied TEXT,
  permanent_fix_applied BOOLEAN DEFAULT FALSE,
  permanent_fix_description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'monitoring', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE recurring_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON recurring_issues FOR ALL USING (auth.role() = 'service_role');
