-- Healing Actions — audit trail for the AI-powered autonomous healing system.
-- Tracks every action taken (or proposed) by the healing processor,
-- including approval status for critical decisions.

CREATE TABLE IF NOT EXISTS healing_actions (
  id bigserial PRIMARY KEY,
  action_type text NOT NULL,        -- 'restart_worker', 'scale_workers', 'drain_queue', 'clean_logs', etc.
  severity text NOT NULL CHECK (severity IN ('autonomous', 'approval_required', 'report_only')),
  description text NOT NULL,
  details jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  result text,
  triggered_by text DEFAULT 'system', -- 'system', 'ai', 'admin'
  telegram_message_id text,           -- for approval tracking
  created_at timestamptz DEFAULT now(),
  executed_at timestamptz
);

-- Fast lookup for pending approvals and recent actions
CREATE INDEX idx_healing_actions_status ON healing_actions(status, created_at DESC);
CREATE INDEX idx_healing_actions_time ON healing_actions(created_at DESC);

-- RLS: only service role can access (admin API uses service role key)
ALTER TABLE healing_actions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE healing_actions IS 'Audit trail for the AI healing system. Tracks autonomous fixes, pending approvals, and AI recommendations.';
