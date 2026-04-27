CREATE TABLE IF NOT EXISTS public.outbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID,
  lead_cnpj VARCHAR(14) NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('whatsapp','email','sms','call')),
  template_name VARCHAR(100),
  campaign_id UUID,
  to_address TEXT NOT NULL,
  message_body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sending','sent','delivered','read','replied','failed','bounced','opted_out')),
  external_id TEXT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbound_lead_cnpj ON public.outbound_messages(lead_cnpj);
CREATE INDEX IF NOT EXISTS idx_outbound_status_channel ON public.outbound_messages(status, channel, queued_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_campaign ON public.outbound_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_outbound_to_address ON public.outbound_messages(to_address);

CREATE TABLE IF NOT EXISTS public.outbound_optouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj VARCHAR(14),
  whatsapp TEXT,
  email TEXT,
  channel VARCHAR(20) NOT NULL,
  reason TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_outbound_optout_cnpj_channel ON public.outbound_optouts(cnpj, channel) WHERE cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbound_optout_whatsapp ON public.outbound_optouts(whatsapp) WHERE whatsapp IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbound_optout_email ON public.outbound_optouts(email) WHERE email IS NOT NULL;

COMMENT ON TABLE public.outbound_messages IS 'Tracking unificado de outbound multi-canal (whatsapp/email/sms). Lead linked logically by cnpj since admin_leads_fornecedores lives in VPS2.';
COMMENT ON TABLE public.outbound_optouts IS 'Lista de supressao centralizada. Antes de enfileirar/enviar, checar se cnpj/whatsapp/email aparece aqui.';

ALTER TABLE public.outbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_optouts ENABLE ROW LEVEL SECURITY;
