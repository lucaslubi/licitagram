-- ============================================================
-- LICITAGRAM: INITIAL DATABASE SCHEMA
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- COMPANIES (tenant principal)
-- ============================================================
CREATE TABLE public.companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  cnpj VARCHAR(14) UNIQUE NOT NULL,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  cnae_principal VARCHAR(10),
  cnaes_secundarios TEXT[] DEFAULT '{}',
  descricao_servicos TEXT,
  porte TEXT CHECK (porte IN ('mei', 'me', 'epp', 'medio', 'grande')),
  uf CHAR(2),
  municipio TEXT,
  capacidades TEXT[] DEFAULT '{}',
  certificacoes TEXT[] DEFAULT '{}',
  palavras_chave TEXT[] DEFAULT '{}',
  faturamento_anual NUMERIC(15,2),
  num_funcionarios INTEGER
);

-- ============================================================
-- USERS (extends auth.users)
-- ============================================================
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  full_name TEXT,
  email TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
  telegram_chat_id BIGINT,
  min_score INTEGER DEFAULT 60,
  ufs_interesse TEXT[] DEFAULT '{}',
  palavras_chave_filtro TEXT[] DEFAULT '{}',
  notification_preferences JSONB DEFAULT '{"email": true, "telegram": true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
CREATE TABLE public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) NOT NULL,
  plan TEXT DEFAULT 'trial' CHECK (plan IN ('trial', 'starter', 'professional', 'enterprise')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'trialing', 'canceled')),
  max_alerts_per_day INTEGER DEFAULT 10,
  max_ai_analyses_month INTEGER DEFAULT 50,
  ai_analyses_used INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- TENDERS (editais/licitacoes)
-- ============================================================
CREATE TABLE public.tenders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pncp_id TEXT UNIQUE NOT NULL,
  numero_compra TEXT,
  ano_compra INTEGER,
  sequencial_compra INTEGER,
  orgao_cnpj TEXT NOT NULL,
  orgao_nome TEXT,
  orgao_esfera TEXT,
  modalidade_id INTEGER,
  modalidade_nome TEXT,
  objeto TEXT NOT NULL,
  valor_estimado NUMERIC(15,2),
  valor_homologado NUMERIC(15,2),
  data_publicacao TIMESTAMPTZ,
  data_abertura TIMESTAMPTZ,
  data_encerramento TIMESTAMPTZ,
  link_sistema_origem TEXT,
  link_pncp TEXT,
  situacao_id INTEGER,
  situacao_nome TEXT,
  uf CHAR(2),
  municipio TEXT,
  requisitos JSONB,
  resumo TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'analyzing', 'analyzed', 'error')),
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- TENDER DOCUMENTS
-- ============================================================
CREATE TABLE public.tender_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tender_id UUID REFERENCES public.tenders(id) ON DELETE CASCADE NOT NULL,
  titulo TEXT,
  tipo TEXT,
  url TEXT NOT NULL,
  storage_path TEXT,
  texto_extraido TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'downloading', 'extracting', 'done', 'error')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- MATCHES (cruzamento empresa x edital)
-- ============================================================
CREATE TABLE public.matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  tender_id UUID REFERENCES public.tenders(id) ON DELETE CASCADE NOT NULL,
  score INTEGER CHECK (score >= 0 AND score <= 100) NOT NULL,
  breakdown JSONB NOT NULL,
  ai_justificativa TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'notified', 'viewed', 'interested', 'applied', 'won', 'lost', 'dismissed')),
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (company_id, tender_id)
);

-- ============================================================
-- COMPETITORS
-- ============================================================
CREATE TABLE public.competitors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tender_id UUID REFERENCES public.tenders(id) ON DELETE CASCADE,
  cnpj TEXT,
  nome TEXT,
  valor_proposta NUMERIC(15,2),
  situacao TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- SCRAPING JOBS
-- ============================================================
CREATE TABLE public.scraping_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_type TEXT NOT NULL CHECK (job_type IN ('scrape', 'extract', 'match', 'notify')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  params JSONB,
  result JSONB,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_tenders_data_publicacao ON public.tenders(data_publicacao DESC);
CREATE INDEX idx_tenders_status ON public.tenders(status);
CREATE INDEX idx_tenders_modalidade ON public.tenders(modalidade_id);
CREATE INDEX idx_tenders_uf ON public.tenders(uf);
CREATE INDEX idx_tenders_pncp_id ON public.tenders(pncp_id);
CREATE INDEX idx_tenders_objeto_trgm ON public.tenders USING gin(objeto gin_trgm_ops);
CREATE INDEX idx_tenders_created ON public.tenders(created_at DESC);
CREATE INDEX idx_matches_company_id ON public.matches(company_id);
CREATE INDEX idx_matches_score ON public.matches(score DESC);
CREATE INDEX idx_matches_status ON public.matches(status);
CREATE INDEX idx_matches_company_status ON public.matches(company_id, status);
CREATE INDEX idx_users_company_id ON public.users(company_id);
CREATE INDEX idx_users_telegram ON public.users(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
CREATE INDEX idx_companies_uf ON public.companies(uf);
CREATE INDEX idx_companies_cnaes ON public.companies USING gin(cnaes_secundarios);
CREATE INDEX idx_scraping_jobs_status ON public.scraping_jobs(status);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tender_documents ENABLE ROW LEVEL SECURITY;

-- Users: read/update own record
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Companies: scoped to user's company
CREATE POLICY "companies_select_own" ON public.companies
  FOR SELECT USING (
    id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
  );
CREATE POLICY "companies_update_own" ON public.companies
  FOR UPDATE USING (
    id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
  );
CREATE POLICY "companies_insert" ON public.companies
  FOR INSERT WITH CHECK (true);

-- Subscriptions: scoped to user's company
CREATE POLICY "subscriptions_select_own" ON public.subscriptions
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
  );

-- Tenders: readable by all authenticated users
CREATE POLICY "tenders_select_authenticated" ON public.tenders
  FOR SELECT USING (auth.role() = 'authenticated');

-- Tender documents: readable by all authenticated users
CREATE POLICY "tender_docs_select_authenticated" ON public.tender_documents
  FOR SELECT USING (auth.role() = 'authenticated');

-- Matches: scoped to user's company
CREATE POLICY "matches_select_own" ON public.matches
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
  );
CREATE POLICY "matches_update_own" ON public.matches
  FOR UPDATE USING (
    company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
  );

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tenders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create public.users row when auth.users row is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
