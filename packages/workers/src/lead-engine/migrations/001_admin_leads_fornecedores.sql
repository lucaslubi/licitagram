-- ============================================================
-- LICITAGRAM LEAD ENGINE — Migration 001
-- Tabela: admin_leads_fornecedores
-- Banco: licitagram_data (VPS2 — PostgreSQL local)
-- Data: 2026-04-06
-- ============================================================

-- ─── ENUMS ──────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE porte_empresa_enum AS ENUM ('MEI', 'ME', 'EPP', 'DEMAIS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE email_fonte_enum AS ENUM ('RFB_CADASTRAL', 'SITE_INSTITUCIONAL', 'GOOGLE_PLACES', 'NAO_ENRIQUECIDO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE telefone_fonte_enum AS ENUM ('RFB_CADASTRAL', 'SITE_INSTITUCIONAL', 'GOOGLE_PLACES', 'NAO_ENRIQUECIDO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE plano_recomendado_enum AS ENUM ('ESSENCIAL', 'PROFISSIONAL', 'ENTERPRISE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE prioridade_outreach_enum AS ENUM ('HOT', 'WARM', 'COLD', 'NAO_DISPARAR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE status_outreach_enum AS ENUM (
    'NAO_CONTACTADO', 'FILA', 'ENVIADO', 'ENTREGUE', 'ABERTO',
    'CLICOU', 'RESPONDEU', 'CONVERTIDO', 'BOUNCE', 'OPT_OUT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── TABELA PRINCIPAL ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_leads_fornecedores (
  -- Identificação
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cnpj VARCHAR(14) NOT NULL UNIQUE,                          -- CNPJ 14 dígitos, sem formatação
  cnpj_raiz VARCHAR(8) NOT NULL,                             -- 8 primeiros dígitos (agrupa filiais da mesma matriz)
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  natureza_juridica TEXT,
  porte porte_empresa_enum,                                  -- MEI, ME, EPP, DEMAIS
  data_abertura DATE,
  situacao_cadastral TEXT,                                    -- Ativa, Baixada, Suspensa, etc.

  -- Localização
  uf CHAR(2),
  municipio TEXT,
  cep VARCHAR(8),
  endereco_completo TEXT,                                    -- logradouro + numero + complemento + bairro

  -- Atividade Econômica
  cnae_principal_codigo VARCHAR(7),                          -- CNAE 7 dígitos
  cnae_principal_descricao TEXT,
  cnae_secundarios JSONB DEFAULT '[]'::jsonb,                -- [{codigo, descricao}, ...]

  -- Contato (APENAS DADOS INSTITUCIONAIS GENÉRICOS — NUNCA EMAILS NOMINAIS)
  email_institucional_generico TEXT,                          -- APENAS contato@, comercial@, licitacoes@, etc.
  email_institucional_fonte email_fonte_enum DEFAULT 'NAO_ENRIQUECIDO',
  email_institucional_validado BOOLEAN DEFAULT false,         -- Passou em SMTP check?
  telefone_comercial TEXT,
  telefone_fonte telefone_fonte_enum DEFAULT 'NAO_ENRIQUECIDO',
  site_institucional TEXT,
  linkedin_empresa TEXT,
  whatsapp_comercial TEXT,                                   -- Apenas se coletado de fonte pública comercial

  -- Scoring Proprietário Licitagram (calculado pelo worker)
  total_licitacoes_participadas_12m INTEGER DEFAULT 0,
  total_licitacoes_participadas_total INTEGER DEFAULT 0,
  total_licitacoes_ganhas_12m INTEGER DEFAULT 0,
  total_licitacoes_ganhas_total INTEGER DEFAULT 0,
  taxa_conversao_vitoria NUMERIC(5,4) DEFAULT 0,             -- ganhas / participadas
  valor_total_contratos_ganhos_12m NUMERIC(15,2) DEFAULT 0,
  valor_total_contratos_ganhos_total NUMERIC(15,2) DEFAULT 0,
  ticket_medio_contratos NUMERIC(15,2) DEFAULT 0,
  maior_contrato_valor NUMERIC(15,2) DEFAULT 0,
  orgaos_compradores_distintos_12m INTEGER DEFAULT 0,
  orgaos_compradores_lista JSONB DEFAULT '[]'::jsonb,        -- Top 10 órgãos [{nome, cnpj, count}, ...]
  esferas_atuacao JSONB DEFAULT '[]'::jsonb,                 -- ["federal","estadual","municipal"]
  ultima_participacao_data TIMESTAMPTZ,
  dias_desde_ultima_participacao INTEGER DEFAULT 0,           -- Calculado: now() - ultima_participacao_data
  licitacoes_perdidas_por_pouco INTEGER DEFAULT 0,           -- Perdeu por margem < 5% (segmento de ouro)
  diversidade_cnae_editais INTEGER DEFAULT 0,                -- Em quantos CNAEs distintos participou

  -- Compliance e Sanções
  status_ceis BOOLEAN DEFAULT false,                         -- Está no CEIS?
  status_cnep BOOLEAN DEFAULT false,
  status_cepim BOOLEAN DEFAULT false,
  esta_limpo BOOLEAN DEFAULT true,                           -- true se NÃO está em nenhuma lista
  data_ultima_verificacao_sancoes TIMESTAMPTZ,

  -- Classificação Licitagram
  score_fit_licitagram INTEGER DEFAULT 0 CHECK (score_fit_licitagram >= 0 AND score_fit_licitagram <= 100),
  plano_recomendado plano_recomendado_enum,
  segmento_vertical TEXT,                                    -- Cluster de CNAE: TI, Construção Civil, Saúde, etc.
  prioridade_outreach prioridade_outreach_enum DEFAULT 'NAO_DISPARAR',
  motivo_qualificacao TEXT,                                  -- Explicação humana gerada automaticamente

  -- Compliance LGPD
  base_legal_lgpd TEXT DEFAULT 'Legítimo Interesse B2B — Art. 7º, IX da Lei 13.709/2018. LIA documentado em /docs/compliance/LIA_LEAD_ENGINE.md',
  lia_versao TEXT DEFAULT 'v1.0',
  opt_out BOOLEAN DEFAULT false,
  opt_out_data TIMESTAMPTZ,
  opt_out_origem TEXT,                                       -- Qual campanha gerou o opt-out
  bloqueado_disparo BOOLEAN DEFAULT false,
  motivo_bloqueio TEXT,

  -- Status de Outreach
  status_outreach status_outreach_enum DEFAULT 'NAO_CONTACTADO',
  total_emails_enviados INTEGER DEFAULT 0,
  total_emails_abertos INTEGER DEFAULT 0,
  total_emails_clicados INTEGER DEFAULT 0,
  data_primeiro_envio TIMESTAMPTZ,
  data_ultimo_envio TIMESTAMPTZ,
  data_ultima_abertura TIMESTAMPTZ,
  ja_e_cliente_licitagram BOOLEAN DEFAULT false,             -- Cruzado com tabela companies no Supabase

  -- Metadata
  criado_em TIMESTAMPTZ DEFAULT now() NOT NULL,
  atualizado_em TIMESTAMPTZ DEFAULT now() NOT NULL,
  ultima_atualizacao_enriquecimento TIMESTAMPTZ,
  versao_score INTEGER DEFAULT 1                             -- Para reprocessar quando fórmula mudar
);

-- Comentários
COMMENT ON TABLE admin_leads_fornecedores IS 'Lead Engine: fornecedores qualificados para outbound B2B. Dados de PJ exclusivamente, nunca PF. Compliance LGPD via legítimo interesse.';
COMMENT ON COLUMN admin_leads_fornecedores.cnpj IS 'CNPJ 14 dígitos sem formatação';
COMMENT ON COLUMN admin_leads_fornecedores.cnpj_raiz IS 'Primeiros 8 dígitos do CNPJ — agrupa matriz + filiais';
COMMENT ON COLUMN admin_leads_fornecedores.email_institucional_generico IS 'APENAS emails tipo contato@, comercial@, licitacoes@. NUNCA emails nominais como joao.silva@';
COMMENT ON COLUMN admin_leads_fornecedores.licitacoes_perdidas_por_pouco IS 'Licitações perdidas por margem < 5% — segmento de ouro para conversão';
COMMENT ON COLUMN admin_leads_fornecedores.score_fit_licitagram IS 'Score 0-100 calculado pela fórmula proprietária. 80-100=HOT, 50-79=WARM, 20-49=COLD, <20=NAO_DISPARAR';
COMMENT ON COLUMN admin_leads_fornecedores.opt_out IS 'LGPD: se true, NUNCA exportar ou contactar. Registro mantido para evitar reimport.';
COMMENT ON COLUMN admin_leads_fornecedores.bloqueado_disparo IS 'Override manual ou automático (sanção, cliente, etc). Impede exportação independente de filtro.';

-- ─── ÍNDICES ────────────────────────────────────────────────

-- Unique já criado no cnpj pela constraint
CREATE INDEX IF NOT EXISTS idx_leads_cnpj_raiz ON admin_leads_fornecedores (cnpj_raiz);
CREATE INDEX IF NOT EXISTS idx_leads_uf_cnae ON admin_leads_fornecedores (uf, cnae_principal_codigo);
CREATE INDEX IF NOT EXISTS idx_leads_score_desc ON admin_leads_fornecedores (score_fit_licitagram DESC);
CREATE INDEX IF NOT EXISTS idx_leads_disparo ON admin_leads_fornecedores (prioridade_outreach, opt_out, bloqueado_disparo)
  WHERE opt_out = false AND bloqueado_disparo = false;
CREATE INDEX IF NOT EXISTS idx_leads_segmento ON admin_leads_fornecedores (segmento_vertical);
CREATE INDEX IF NOT EXISTS idx_leads_plano ON admin_leads_fornecedores (plano_recomendado);
CREATE INDEX IF NOT EXISTS idx_leads_ultima_part ON admin_leads_fornecedores (ultima_participacao_data DESC);
CREATE INDEX IF NOT EXISTS idx_leads_outreach ON admin_leads_fornecedores (status_outreach);
CREATE INDEX IF NOT EXISTS idx_leads_uf ON admin_leads_fornecedores (uf);
CREATE INDEX IF NOT EXISTS idx_leads_opt_out ON admin_leads_fornecedores (opt_out) WHERE opt_out = true;
CREATE INDEX IF NOT EXISTS idx_leads_cliente ON admin_leads_fornecedores (ja_e_cliente_licitagram) WHERE ja_e_cliente_licitagram = true;


-- ============================================================
-- Tabela: admin_leads_exports (histórico de exportações CSV)
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_leads_exports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_email TEXT NOT NULL,                                 -- Quem exportou
  admin_user_id TEXT,                                        -- UUID do admin no Supabase (referência externa)
  filtros_aplicados JSONB NOT NULL,                          -- Filtros usados no export
  total_leads_exportados INTEGER NOT NULL,
  total_leads_bloqueados_lgpd INTEGER DEFAULT 0,             -- Quantos foram impedidos de exportar
  hash_arquivo TEXT,                                         -- SHA-256 do CSV gerado
  nome_arquivo TEXT,
  base_legal_aplicada TEXT DEFAULT 'Legítimo Interesse B2B — Art. 7º, IX',
  criado_em TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE admin_leads_exports IS 'Audit trail de toda exportação CSV de leads. Compliance LGPD obrigatório.';


-- ============================================================
-- Tabela: admin_leads_audit_log (log de operações sensíveis)
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_leads_audit_log (
  id BIGSERIAL PRIMARY KEY,
  acao TEXT NOT NULL,                                        -- export, opt_out, bloqueio, edicao_contato, worker_run, etc.
  admin_email TEXT,                                          -- Quem executou (null se sistema)
  admin_user_id TEXT,
  detalhes JSONB,                                            -- Dados específicos da ação
  cnpj_afetado VARCHAR(14),                                  -- Se a ação afeta um CNPJ específico
  total_afetados INTEGER,                                    -- Se ação em massa
  ip_address TEXT,
  user_agent TEXT,
  criado_em TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_acao ON admin_leads_audit_log (acao);
CREATE INDEX IF NOT EXISTS idx_audit_log_cnpj ON admin_leads_audit_log (cnpj_afetado) WHERE cnpj_afetado IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_data ON admin_leads_audit_log (criado_em DESC);

COMMENT ON TABLE admin_leads_audit_log IS 'Log de auditoria LGPD para todas operações do Lead Engine: exports, opt-outs, bloqueios, edições, workers.';


-- ============================================================
-- Tabela: admin_leads_segmentos (segmentos nomeados de campanha)
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_leads_segmentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  filtros JSONB NOT NULL,                                    -- Filtros que definem o segmento
  total_leads INTEGER DEFAULT 0,
  criado_por_email TEXT NOT NULL,
  criado_por_user_id TEXT,
  criado_em TIMESTAMPTZ DEFAULT now() NOT NULL,
  atualizado_em TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE admin_leads_segmentos IS 'Segmentos nomeados de campanha — seleções salvas para reuso em outbound.';


-- ============================================================
-- Trigger para atualizar atualizado_em automaticamente
-- ============================================================

CREATE OR REPLACE FUNCTION update_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_updated_at ON admin_leads_fornecedores;
CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON admin_leads_fornecedores
  FOR EACH ROW
  EXECUTE FUNCTION update_leads_updated_at();


-- ============================================================
-- Função helper: mapear porte RFB → enum
-- ============================================================

CREATE OR REPLACE FUNCTION map_porte_rfb(porte_rfb TEXT)
RETURNS porte_empresa_enum AS $$
BEGIN
  RETURN CASE
    WHEN porte_rfb ILIKE '%MEI%' OR porte_rfb ILIKE '%MICROEMPREENDEDOR INDIVIDUAL%' THEN 'MEI'::porte_empresa_enum
    WHEN porte_rfb ILIKE '%MICROEMPRESA%' OR porte_rfb ILIKE '%MICRO EMPRESA%' THEN 'ME'::porte_empresa_enum
    WHEN porte_rfb ILIKE '%PEQUENO PORTE%' OR porte_rfb ILIKE '%EPP%' THEN 'EPP'::porte_empresa_enum
    ELSE 'DEMAIS'::porte_empresa_enum
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION map_porte_rfb(TEXT) IS 'Converte string de porte da RFB (ex: "EMPRESA DE PEQUENO PORTE") para enum porte_empresa_enum (EPP)';


-- ============================================================
-- Mapeamento CNAE → Segmento Vertical
-- ============================================================

CREATE OR REPLACE FUNCTION map_cnae_segmento(cnae_codigo TEXT)
RETURNS TEXT AS $$
DECLARE
  divisao TEXT;
BEGIN
  divisao := LEFT(cnae_codigo, 2);
  RETURN CASE divisao
    -- Construção Civil e Engenharia
    WHEN '41' THEN 'Construção de Edifícios'
    WHEN '42' THEN 'Infraestrutura'
    WHEN '43' THEN 'Serviços de Construção'
    -- TI e Telecomunicações
    WHEN '62' THEN 'Tecnologia da Informação'
    WHEN '63' THEN 'Serviços de Informação'
    WHEN '61' THEN 'Telecomunicações'
    -- Saúde
    WHEN '86' THEN 'Saúde'
    WHEN '21' THEN 'Farmacêutico'
    WHEN '32' THEN 'Equipamentos Médicos'
    -- Alimentação
    WHEN '10' THEN 'Alimentos'
    WHEN '56' THEN 'Alimentação e Refeições'
    WHEN '11' THEN 'Bebidas'
    -- Limpeza e Facilities
    WHEN '81' THEN 'Limpeza e Facilities'
    WHEN '80' THEN 'Segurança'
    -- Comércio
    WHEN '46' THEN 'Comércio Atacadista'
    WHEN '47' THEN 'Comércio Varejista'
    -- Transporte e Logística
    WHEN '49' THEN 'Transporte Terrestre'
    WHEN '50' THEN 'Transporte Aquaviário'
    WHEN '51' THEN 'Transporte Aéreo'
    WHEN '52' THEN 'Armazenamento e Logística'
    -- Serviços Profissionais
    WHEN '69' THEN 'Consultoria Jurídica/Contábil'
    WHEN '70' THEN 'Consultoria Empresarial'
    WHEN '71' THEN 'Engenharia e Arquitetura'
    WHEN '73' THEN 'Marketing e Publicidade'
    WHEN '74' THEN 'Serviços Técnicos'
    -- Educação
    WHEN '85' THEN 'Educação'
    -- Indústria
    WHEN '22' THEN 'Plásticos e Borracha'
    WHEN '25' THEN 'Produtos de Metal'
    WHEN '28' THEN 'Máquinas e Equipamentos'
    WHEN '29' THEN 'Veículos'
    WHEN '33' THEN 'Manutenção Industrial'
    -- Energia e Utilities
    WHEN '35' THEN 'Energia e Gás'
    WHEN '36' THEN 'Água e Saneamento'
    WHEN '37' THEN 'Esgoto'
    WHEN '38' THEN 'Resíduos'
    -- Outros
    WHEN '77' THEN 'Locação de Equipamentos'
    WHEN '78' THEN 'Recursos Humanos'
    WHEN '82' THEN 'Serviços Administrativos'
    ELSE 'Outros (' || COALESCE(divisao, '??') || ')'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION map_cnae_segmento(TEXT) IS 'Converte código CNAE (divisão 2 dígitos) para segmento vertical legível';
