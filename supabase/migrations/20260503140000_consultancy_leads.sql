-- consultancy_leads: leads do programa Partners (consultorias).
-- Alimentado pela calculadora pública /calculadora-consultoria.
-- Sem RLS pra cliente — só service_role acessa.

CREATE TABLE IF NOT EXISTS public.consultancy_leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT NOT NULL,
  clientes_atuais   INT,
  ticket_medio      NUMERIC,
  horas_por_cliente INT,
  automation_rate   NUMERIC,
  projection        JSONB,
  source            TEXT NOT NULL DEFAULT 'partners-calculator',
  status            TEXT NOT NULL DEFAULT 'new',
    -- new | contacted | qualified | converted | rejected
  ip                TEXT,
  user_agent        TEXT,
  notes             JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT consultancy_leads_status_chk CHECK (
    status IN ('new', 'contacted', 'qualified', 'converted', 'rejected')
  )
);

-- 1 lead por email (atualiza em vez de duplicar via UPSERT no app se necessário)
CREATE UNIQUE INDEX IF NOT EXISTS consultancy_leads_email_uniq
  ON public.consultancy_leads (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_consultancy_leads_status
  ON public.consultancy_leads (status, created_at DESC);

ALTER TABLE public.consultancy_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consultancy_leads_service_role_all"
  ON public.consultancy_leads
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.consultancy_leads_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS consultancy_leads_updated_at_trg ON public.consultancy_leads;
CREATE TRIGGER consultancy_leads_updated_at_trg
  BEFORE UPDATE ON public.consultancy_leads
  FOR EACH ROW EXECUTE FUNCTION public.consultancy_leads_set_updated_at();
