-- LICITAGRAM SUPREME BOT — Public API v1 surface.
--
-- Enterprise customers (and power users) can drive the bot via REST +
-- webhooks. Table layout:
--
--   bot_api_keys   — hashed bearer tokens the client sends in Authorization.
--                    We store only the SHA-256 of the token; the plaintext
--                    is shown ONCE at creation, then never again.
--   bot_webhooks   — URL + secret for HMAC-signed event delivery.
--   bot_webhook_deliveries — per-event delivery log (success / failure /
--                    next retry). Powers the dashboard's "delivery health".
--
-- Both tables have a `company_id` FK and RLS scoped to session owner.

-- ─── API keys ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bot_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- SHA-256(plaintext). We NEVER store the plaintext.
  key_hash BYTEA NOT NULL,
  -- First 8 chars of the plaintext, displayed in the UI so users can
  -- identify which key is which without exposing the secret.
  key_preview TEXT NOT NULL,
  -- Bitmask of allowed scopes. Starts simple: 'read' | 'write'.
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read']::TEXT[],
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.bot_api_keys IS
  'Bearer tokens for the Supreme Bot public API. Only the SHA-256 hash is stored.';
COMMENT ON COLUMN public.bot_api_keys.key_preview IS
  'First 8 characters of the plaintext — purely a UX affordance so users can '
  'recognize their own keys. Never enough to reconstruct the secret.';

CREATE INDEX IF NOT EXISTS bot_api_keys_company_idx
  ON public.bot_api_keys (company_id)
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bot_api_keys_hash_uniq
  ON public.bot_api_keys (key_hash);

ALTER TABLE public.bot_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own bot api keys"
  ON public.bot_api_keys FOR ALL
  USING (company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid()));

-- ─── Webhooks ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bot_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- Delivery endpoint (HTTPS only enforced at application layer).
  url TEXT NOT NULL,
  -- HMAC signing secret — encrypted at rest via the same AES-GCM scheme
  -- used for bot_configs credentials.
  secret_cipher BYTEA NOT NULL,
  secret_nonce  BYTEA NOT NULL,
  -- Which event kinds to deliver. Empty = all.
  event_kinds TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bot_webhooks_company_idx
  ON public.bot_webhooks (company_id)
  WHERE enabled = TRUE;

ALTER TABLE public.bot_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own bot webhooks"
  ON public.bot_webhooks FOR ALL
  USING (company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid()));

-- ─── Delivery log ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bot_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES public.bot_webhooks(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.bot_sessions(id) ON DELETE SET NULL,
  event_kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_status_code INTEGER,
  last_response_snippet TEXT,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bot_webhook_deliveries_pending_idx
  ON public.bot_webhook_deliveries (next_retry_at)
  WHERE delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS bot_webhook_deliveries_webhook_idx
  ON public.bot_webhook_deliveries (webhook_id, created_at DESC);

ALTER TABLE public.bot_webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own webhook deliveries"
  ON public.bot_webhook_deliveries FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid()));

NOTIFY pgrst, 'reload schema';
