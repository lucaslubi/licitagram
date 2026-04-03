-- ============================================================
-- MiroFish Integration: Neural Analysis Tables
-- ============================================================
-- These tables store results from MiroFish's multi-agent
-- prediction engine. They are populated ON DEMAND only when
-- a user explicitly triggers "Analise Neural".
-- ============================================================

-- 1. Neural Fraud Analysis (deep graph + simulation results)
CREATE TABLE IF NOT EXISTS public.mirofish_fraud_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id UUID NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,

  -- Risk assessment
  risk_score NUMERIC(3,2) NOT NULL DEFAULT 0,  -- 0.00 to 1.00
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('critical', 'high', 'medium', 'low')),

  -- Graph data (for D3 visualization)
  graph_nodes JSONB NOT NULL DEFAULT '[]',      -- [{id, label, type, risk, cnpj, ...}]
  graph_edges JSONB NOT NULL DEFAULT '[]',      -- [{source, target, type, weight, ...}]
  network_depth INTEGER NOT NULL DEFAULT 1,
  companies_analyzed INTEGER NOT NULL DEFAULT 0,

  -- Analysis results
  hidden_connections JSONB DEFAULT '[]',         -- connections found beyond 1 hop
  collusion_indicators JSONB DEFAULT '[]',       -- [{type, probability, description}]
  simulation_timeline JSONB DEFAULT '[]',        -- [{round, actions, state}]
  simulation_summary TEXT,
  recommended_actions TEXT[] DEFAULT '{}',

  -- Chat context (for interactive Q&A)
  mirofish_project_id TEXT,                      -- MiroFish project reference
  mirofish_graph_id TEXT,                        -- Zep graph reference
  mirofish_simulation_id TEXT,                   -- Simulation reference

  -- Cost tracking
  llm_tokens_used INTEGER DEFAULT 0,
  analysis_duration_ms INTEGER DEFAULT 0,

  -- Metadata
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cached')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,

  UNIQUE(tender_id, company_id)
);

-- 2. Neural Price Predictions (enhanced forecasting)
CREATE TABLE IF NOT EXISTS public.mirofish_price_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash TEXT NOT NULL,                      -- hash of search params for caching
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,

  -- Prediction results
  item_description TEXT,
  predicted_range_low NUMERIC(15,2),
  predicted_range_high NUMERIC(15,2),
  predicted_median NUMERIC(15,2),
  confidence_score NUMERIC(3,2) DEFAULT 0,       -- 0.00 to 1.00

  -- Graph data (for D3 visualization)
  supplier_graph_nodes JSONB DEFAULT '[]',       -- [{id, label, cnpj, volume, behavior}]
  supplier_graph_edges JSONB DEFAULT '[]',       -- [{source, target, type}]
  price_curve JSONB DEFAULT '[]',                -- [{month, actual, predicted_low, predicted_high}]

  -- Analysis
  anomaly_flags JSONB DEFAULT '[]',              -- [{type, description, severity, cnpjs}]
  supplier_behavior_summary TEXT,
  simulation_timeline JSONB DEFAULT '[]',        -- [{round, bids, convergence}]
  market_insights TEXT,

  -- Chat context
  mirofish_project_id TEXT,
  mirofish_graph_id TEXT,
  mirofish_simulation_id TEXT,

  -- Cost tracking
  llm_tokens_used INTEGER DEFAULT 0,
  analysis_duration_ms INTEGER DEFAULT 0,

  -- Metadata
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cached')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,                        -- cache TTL (7 days default)

  UNIQUE(query_hash, company_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mfa_tender ON public.mirofish_fraud_analysis(tender_id);
CREATE INDEX IF NOT EXISTS idx_mfa_company ON public.mirofish_fraud_analysis(company_id);
CREATE INDEX IF NOT EXISTS idx_mfa_status ON public.mirofish_fraud_analysis(status);
CREATE INDEX IF NOT EXISTS idx_mpp_hash ON public.mirofish_price_predictions(query_hash);
CREATE INDEX IF NOT EXISTS idx_mpp_company ON public.mirofish_price_predictions(company_id);
CREATE INDEX IF NOT EXISTS idx_mpp_expires ON public.mirofish_price_predictions(expires_at);

-- RLS
ALTER TABLE public.mirofish_fraud_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mirofish_price_predictions ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user can read (results are per-tender/company, filtered in queries)
CREATE POLICY "mfa_select_authenticated" ON public.mirofish_fraud_analysis
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "mpp_select_authenticated" ON public.mirofish_price_predictions
  FOR SELECT USING (auth.role() = 'authenticated');

-- Write: service role only (workers write, not users)
-- No INSERT/UPDATE/DELETE policies for authenticated — all writes go through service_role
