-- Proposals table for generated commercial proposals
CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tender_id UUID REFERENCES tenders(id) ON DELETE SET NULL,
  match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  template_type TEXT NOT NULL CHECK (template_type IN ('bens', 'servicos', 'tic_saas')),
  -- Snapshot da licitação
  licitacao_numero TEXT,
  licitacao_modalidade TEXT,
  licitacao_uasg TEXT,
  licitacao_orgao TEXT,
  licitacao_objeto TEXT,
  -- Snapshot da empresa
  empresa_razao_social TEXT,
  empresa_cnpj TEXT,
  empresa_endereco TEXT,
  empresa_cep TEXT,
  empresa_telefone TEXT,
  empresa_email TEXT,
  empresa_banco TEXT,
  empresa_agencia TEXT,
  empresa_conta TEXT,
  representante_nome TEXT,
  representante_cpf TEXT,
  representante_cargo TEXT,
  -- Proposta
  items JSONB NOT NULL DEFAULT '[]',
  valor_mensal NUMERIC,
  valor_global NUMERIC NOT NULL,
  valor_global_extenso TEXT,
  validade_dias INTEGER DEFAULT 60,
  prazo_entrega TEXT,
  declarations JSONB DEFAULT '["exequibilidade","tributos_inclusos","conhecimento_edital","validade_proposta"]',
  cidade TEXT,
  observacoes TEXT,
  -- Status e storage
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'submitted', 'archived')),
  docx_storage_path TEXT,
  pdf_storage_path TEXT,
  version INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proposals_select" ON proposals FOR SELECT
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "proposals_insert" ON proposals FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "proposals_update" ON proposals FOR UPDATE
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "proposals_delete" ON proposals FOR DELETE
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

-- Index
CREATE INDEX idx_proposals_company_id ON proposals(company_id);
CREATE INDEX idx_proposals_tender_id ON proposals(tender_id);
CREATE INDEX idx_proposals_status ON proposals(status);
