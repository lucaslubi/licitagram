-- Anti-ban hardening: human-in-the-loop approval gate on outbound_messages.
-- Worker outbound-whatsapp NÃO envia até approved_by_admin=true.
-- Fluxo: personalize gera msgs (status=queued, approved=false) → admin revê → SQL UPDATE.

ALTER TABLE public.outbound_messages
  ADD COLUMN IF NOT EXISTS approved_by_admin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by TEXT;

CREATE INDEX IF NOT EXISTS idx_outbound_messages_pending_approval
  ON public.outbound_messages(campaign_id, status)
  WHERE approved_by_admin = false AND status = 'queued';

COMMENT ON COLUMN public.outbound_messages.approved_by_admin IS
  'Anti-ban gate: worker só envia se TRUE. Setar via UPDATE manual depois de revisar amostra.';
