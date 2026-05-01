-- trial_leads: fila de leads do signup pra automação de vendas via WhatsApp.
--
-- Alimentada pelo /auth/callback após o usuário confirmar email + preencher
-- WhatsApp no register form. Consumida pelo worker outbound-personalize
-- (já existente em packages/workers/src/processors/outbound-personalize.processor.ts)
-- que decide quando + qual mensagem mandar baseado em `status` + `last_*_at`.

CREATE TABLE IF NOT EXISTS public.trial_leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email           TEXT,
  whatsapp_number TEXT NOT NULL,
  full_name       TEXT,
  source          TEXT NOT NULL DEFAULT 'register_form',
  status          TEXT NOT NULL DEFAULT 'queued', -- queued | welcomed | followup_1 | followup_2 | converted | unsubscribed | bounced
  last_message_at TIMESTAMPTZ,
  next_message_at TIMESTAMPTZ DEFAULT NOW(),       -- imediatamente elegível pra mensagem 1
  message_count   INT NOT NULL DEFAULT 0,
  notes           JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trial_leads_status_chk CHECK (
    status IN ('queued', 'welcomed', 'followup_1', 'followup_2', 'converted', 'unsubscribed', 'bounced')
  )
);

-- Um lead por (user_id) ativo (pra não criar duplicata se signup for retomado).
CREATE UNIQUE INDEX IF NOT EXISTS trial_leads_user_id_uniq
  ON public.trial_leads (user_id)
  WHERE user_id IS NOT NULL AND status NOT IN ('unsubscribed', 'bounced');

-- Worker consulta por status + next_message_at <= now()
CREATE INDEX IF NOT EXISTS idx_trial_leads_due
  ON public.trial_leads (next_message_at)
  WHERE status IN ('queued', 'welcomed', 'followup_1');

-- LGPD: cliente que se descadastra entra em 'unsubscribed'.
-- Campo `notes` guarda histórico (template usado, resposta etc) sem mexer
-- na shape principal.

COMMENT ON TABLE public.trial_leads IS
  'Fila de leads do signup → automação WhatsApp pre-conversão (drip campaign).';
COMMENT ON COLUMN public.trial_leads.status IS
  'queued (criado, aguarda welcome) → welcomed → followup_1 → followup_2 → converted/unsubscribed/bounced';
COMMENT ON COLUMN public.trial_leads.next_message_at IS
  'Quando o worker pode enviar a próxima mensagem. Inicializa como NOW() (welcome imediato).';

-- RLS: só service_role grava/lê. Cliente nunca vê.
ALTER TABLE public.trial_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trial_leads_service_role_all"
  ON public.trial_leads
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.trial_leads_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trial_leads_updated_at_trg ON public.trial_leads;
CREATE TRIGGER trial_leads_updated_at_trg
  BEFORE UPDATE ON public.trial_leads
  FOR EACH ROW EXECUTE FUNCTION public.trial_leads_set_updated_at();
