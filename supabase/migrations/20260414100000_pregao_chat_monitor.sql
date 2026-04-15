-- ============================================================
-- PREGÃO CHAT MONITOR — Tables for real-time pregão chat monitoring
--
-- Monitors bidding room chats from government procurement portals
-- (Compras.gov.br MVP, extensible to BLL, Licitanet, PCP).
-- Stores encrypted credentials, persists chat messages,
-- classifies urgency via AI, and triggers WhatsApp alerts.
--
-- DOWN MIGRATION (run in reverse order):
--   DROP TABLE IF EXISTS public.pregao_portais_health CASCADE;
--   DROP TABLE IF EXISTS public.pregao_notificacoes CASCADE;
--   DROP TABLE IF EXISTS public.pregao_mensagens CASCADE;
--   DROP TABLE IF EXISTS public.pregoes_monitorados CASCADE;
--   DROP TABLE IF EXISTS public.pregao_sessoes_portal CASCADE;
--   DROP TABLE IF EXISTS public.pregao_portais_credenciais CASCADE;
-- ============================================================

-- ============================================================
-- 1. PREGAO_PORTAIS_CREDENCIAIS
-- Encrypted portal credentials per company per portal.
-- Credentials encrypted at application level via sodium-native.
-- ============================================================

CREATE TABLE public.pregao_portais_credenciais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  portal_slug TEXT NOT NULL CHECK (portal_slug IN ('comprasgov', 'bll', 'licitanet', 'pcp')),
  cnpj_licitante TEXT NOT NULL,

  -- Credentials encrypted via sodium-native (application-level)
  login_usuario_cipher BYTEA NOT NULL,
  login_senha_cipher BYTEA NOT NULL,
  login_nonce BYTEA NOT NULL,

  -- Optional A1 digital certificate (path in Supabase Storage, encrypted)
  certificado_a1_storage_path TEXT,
  certificado_a1_senha_cipher BYTEA,
  certificado_a1_nonce BYTEA,

  metodo_login TEXT NOT NULL DEFAULT 'usuario_senha'
    CHECK (metodo_login IN ('usuario_senha', 'gov_br', 'certificado_a1')),

  status TEXT NOT NULL DEFAULT 'nao_testado'
    CHECK (status IN ('nao_testado', 'testando', 'ativo', 'invalido', 'bloqueado')),
  ultimo_teste_em TIMESTAMPTZ,
  ultimo_teste_erro TEXT,
  ultimo_login_sucesso_em TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (company_id, portal_slug, cnpj_licitante)
);

CREATE INDEX idx_pregao_cred_company ON public.pregao_portais_credenciais(company_id);
CREATE INDEX idx_pregao_cred_status ON public.pregao_portais_credenciais(status)
  WHERE status = 'ativo';

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.pregao_portais_credenciais
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.pregao_portais_credenciais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pregao_cred_company_isolation" ON public.pregao_portais_credenciais
  FOR ALL USING (
    company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
  );


-- ============================================================
-- 2. PREGAO_SESSOES_PORTAL
-- Persisted Playwright storageState (cookies/tokens) per credential.
-- Avoids re-login on every poll cycle.
-- ============================================================

CREATE TABLE public.pregao_sessoes_portal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credencial_id UUID NOT NULL REFERENCES public.pregao_portais_credenciais(id) ON DELETE CASCADE,

  -- Playwright storageState serialized + encrypted via sodium-native
  storage_state_cipher BYTEA NOT NULL,
  storage_state_nonce BYTEA NOT NULL,

  expira_em TIMESTAMPTZ NOT NULL,
  worker_id TEXT,       -- hostname/pid of worker holding this session
  locked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (credencial_id)
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.pregao_sessoes_portal
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.pregao_sessoes_portal ENABLE ROW LEVEL SECURITY;

-- Sessions accessed only via service_role (workers). No anon/authenticated policy needed.
-- RLS enabled but no SELECT policy = blocked for browser clients.


-- ============================================================
-- 3. PREGOES_MONITORADOS
-- Each row = one pregão being actively monitored for a company.
-- ============================================================

CREATE TABLE public.pregoes_monitorados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  credencial_id UUID NOT NULL REFERENCES public.pregao_portais_credenciais(id) ON DELETE RESTRICT,

  portal_slug TEXT NOT NULL,
  portal_pregao_id TEXT NOT NULL, -- ID within portal (e.g. UASG+number)
  portal_pregao_url TEXT NOT NULL,

  pncp_id TEXT,                  -- optional link to already-ingested PNCP tender
  orgao_nome TEXT NOT NULL,
  orgao_uasg TEXT,
  numero_pregao TEXT NOT NULL,
  objeto_resumido TEXT,

  fase_atual TEXT NOT NULL DEFAULT 'desconhecida' CHECK (fase_atual IN (
    'desconhecida', 'agendado', 'proposta', 'disputa', 'negociacao',
    'aceitacao', 'habilitacao', 'recurso', 'suspenso', 'homologado', 'encerrado'
  )),

  data_abertura TIMESTAMPTZ,

  status_monitoramento TEXT NOT NULL DEFAULT 'ativo' CHECK (status_monitoramento IN (
    'ativo', 'pausado', 'encerrado', 'erro'
  )),
  polling_interval_ms INTEGER NOT NULL DEFAULT 5000,

  ultimo_poll_em TIMESTAMPTZ,
  ultimo_poll_sucesso_em TIMESTAMPTZ,
  proximo_poll_em TIMESTAMPTZ,
  erros_consecutivos INTEGER NOT NULL DEFAULT 0,
  ultimo_erro TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (company_id, portal_slug, portal_pregao_id)
);

CREATE INDEX idx_pregoes_proximo_poll ON public.pregoes_monitorados(proximo_poll_em)
  WHERE status_monitoramento = 'ativo';
CREATE INDEX idx_pregoes_company ON public.pregoes_monitorados(company_id);
CREATE INDEX idx_pregoes_status ON public.pregoes_monitorados(status_monitoramento);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.pregoes_monitorados
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.pregoes_monitorados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pregoes_mon_company_isolation" ON public.pregoes_monitorados
  FOR ALL USING (
    company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
  );


-- ============================================================
-- 4. PREGAO_MENSAGENS
-- Every chat message scraped from a monitored pregão.
-- Deduplication via sha256 hash. Classification fields nullable (async AI).
-- ============================================================

CREATE TABLE public.pregao_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pregao_id UUID NOT NULL REFERENCES public.pregoes_monitorados(id) ON DELETE CASCADE,
  company_id UUID NOT NULL, -- denormalized for simpler RLS

  hash_mensagem TEXT NOT NULL, -- sha256 for dedup

  remetente TEXT NOT NULL CHECK (remetente IN (
    'pregoeiro', 'sistema', 'licitante_proprio', 'outro_licitante'
  )),
  remetente_identificacao TEXT,
  conteudo TEXT NOT NULL,
  data_hora_portal TIMESTAMPTZ NOT NULL,
  capturada_em TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- AI classification fields (nullable — filled async by classify worker)
  classificacao_tipo TEXT CHECK (classificacao_tipo IN (
    'convocacao', 'diligencia', 'suspensao', 'retomada', 'aceitacao',
    'desclassificacao', 'habilitacao', 'recurso', 'esclarecimento', 'geral'
  )),
  classificacao_urgencia TEXT CHECK (classificacao_urgencia IN (
    'critica', 'alta', 'normal', 'baixa'
  )),
  classificacao_em TIMESTAMPTZ,
  requer_acao_licitante BOOLEAN,
  prazo_detectado_ate TIMESTAMPTZ,
  resumo_acao TEXT,

  notificacao_whatsapp_enviada_em TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (pregao_id, hash_mensagem)
);

CREATE INDEX idx_pregao_msg_pregao_ts ON public.pregao_mensagens(pregao_id, data_hora_portal DESC);
CREATE INDEX idx_pregao_msg_pendente_classif ON public.pregao_mensagens(created_at)
  WHERE classificacao_em IS NULL;
CREATE INDEX idx_pregao_msg_company ON public.pregao_mensagens(company_id);

ALTER TABLE public.pregao_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pregao_msg_company_isolation" ON public.pregao_mensagens
  FOR ALL USING (
    company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
  );


-- ============================================================
-- 5. PREGAO_NOTIFICACOES
-- Notification delivery log per message per channel.
-- ============================================================

CREATE TABLE public.pregao_notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem_id UUID NOT NULL REFERENCES public.pregao_mensagens(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,

  canal TEXT NOT NULL CHECK (canal IN ('whatsapp', 'email', 'push')),
  destinatario TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'falhou')),
  tentativas INTEGER NOT NULL DEFAULT 0,
  enviado_em TIMESTAMPTZ,
  erro TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pregao_notif_mensagem ON public.pregao_notificacoes(mensagem_id);
CREATE INDEX idx_pregao_notif_company ON public.pregao_notificacoes(company_id);
CREATE INDEX idx_pregao_notif_pendente ON public.pregao_notificacoes(status)
  WHERE status = 'pendente';

ALTER TABLE public.pregao_notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pregao_notif_company_isolation" ON public.pregao_notificacoes
  FOR ALL USING (
    company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
  );


-- ============================================================
-- 6. PREGAO_PORTAIS_HEALTH
-- System-wide portal health monitoring. NO RLS (global table).
-- ============================================================

CREATE TABLE public.pregao_portais_health (
  portal_slug TEXT PRIMARY KEY,
  ultimo_login_sucesso_em TIMESTAMPTZ,
  ultimo_poll_sucesso_em TIMESTAMPTZ,
  falhas_consecutivas INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'desconhecido' CHECK (status IN (
    'ok', 'degradado', 'fora_do_ar', 'desconhecido'
  )),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed portal entries
INSERT INTO public.pregao_portais_health (portal_slug, status) VALUES
  ('comprasgov', 'desconhecido'),
  ('bll', 'desconhecido'),
  ('licitanet', 'desconhecido'),
  ('pcp', 'desconhecido')
ON CONFLICT (portal_slug) DO NOTHING;
