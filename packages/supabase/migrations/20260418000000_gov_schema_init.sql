-- ============================================================
-- LICITAGOV: schema inicial (Fase 0 do master plan)
-- ============================================================
-- D-3: isolamento por schema licitagov.* no mesmo DB Supabase.
-- RI-3 / RI-4: NENHUMA escrita em public.*; apenas uma VIEW read-only
--              para reusar dados do Licitagram B2B.
-- Esta migration cria o schema base. Módulos (PCA, processos, artefatos,
-- riscos, preços, catálogo) vêm em fases subsequentes.
-- ============================================================

-- Extensões necessárias. vector fica ativo aqui para permitir embeddings
-- (HNSW) em fases futuras (catalogo_normalizado). Se o role não tiver
-- privilégio, habilitar via dashboard Supabase antes de aplicar.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE SCHEMA IF NOT EXISTS licitagov;
GRANT USAGE ON SCHEMA licitagov TO authenticated;
GRANT USAGE ON SCHEMA licitagov TO service_role;
GRANT USAGE ON SCHEMA licitagov TO anon;

-- ============================================================
-- Função utilitária: touch_updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION licitagov.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = licitagov, pg_temp
AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================
-- ORGAOS (tenants)
-- ============================================================
CREATE TABLE licitagov.orgaos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj VARCHAR(14) UNIQUE NOT NULL,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  esfera VARCHAR(10) NOT NULL CHECK (esfera IN ('federal', 'estadual', 'municipal', 'distrital')),
  poder VARCHAR(20) CHECK (poder IN ('executivo', 'legislativo', 'judiciario', 'autonomo')),
  uf CHAR(2),
  municipio TEXT,
  codigo_ibge VARCHAR(7),
  natureza_juridica VARCHAR(4),
  perfil_regulatorio_id UUID,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_orgaos_uf ON licitagov.orgaos(uf);
CREATE INDEX idx_orgaos_esfera ON licitagov.orgaos(esfera);

CREATE TRIGGER trg_orgaos_touch
  BEFORE UPDATE ON licitagov.orgaos
  FOR EACH ROW EXECUTE FUNCTION licitagov.touch_updated_at();

-- ============================================================
-- USUARIOS (extends auth.users)
-- ============================================================
CREATE TABLE licitagov.usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  orgao_id UUID NOT NULL REFERENCES licitagov.orgaos(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nome_completo TEXT NOT NULL,
  cpf VARCHAR(11),
  cargo TEXT,
  papel VARCHAR(30) NOT NULL DEFAULT 'requisitante'
    CHECK (papel IN ('requisitante', 'agente_contratacao', 'coordenador', 'assessor_juridico', 'ordenador_despesa', 'admin')),
  mfa_habilitado BOOLEAN NOT NULL DEFAULT FALSE,
  ultimo_acesso_em TIMESTAMPTZ,
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_usuarios_orgao ON licitagov.usuarios(orgao_id);

CREATE TRIGGER trg_usuarios_touch
  BEFORE UPDATE ON licitagov.usuarios
  FOR EACH ROW EXECUTE FUNCTION licitagov.touch_updated_at();

-- ============================================================
-- SETORES (unidades requisitantes dentro do órgão)
-- ============================================================
CREATE TABLE licitagov.setores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orgao_id UUID NOT NULL REFERENCES licitagov.orgaos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  sigla TEXT,
  responsavel_id UUID REFERENCES licitagov.usuarios(id) ON DELETE SET NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_setores_orgao ON licitagov.setores(orgao_id);

CREATE TRIGGER trg_setores_touch
  BEFORE UPDATE ON licitagov.setores
  FOR EACH ROW EXECUTE FUNCTION licitagov.touch_updated_at();

-- ============================================================
-- CAMPANHAS DE PCA (Plano de Contratações Anual — Fase 3)
-- ============================================================
CREATE TABLE licitagov.campanhas_pca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orgao_id UUID NOT NULL REFERENCES licitagov.orgaos(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  prazo_resposta_em TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'coletando', 'consolidando', 'aprovado', 'publicado', 'arquivado')),
  criado_por UUID REFERENCES licitagov.usuarios(id) ON DELETE SET NULL,
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (orgao_id, ano)
);
CREATE INDEX idx_campanhas_pca_orgao ON licitagov.campanhas_pca(orgao_id);

CREATE TRIGGER trg_campanhas_pca_touch
  BEFORE UPDATE ON licitagov.campanhas_pca
  FOR EACH ROW EXECUTE FUNCTION licitagov.touch_updated_at();

-- ============================================================
-- RESPOSTAS DE SETOR (tokens públicos para setores responderem PCA)
-- ============================================================
CREATE TABLE licitagov.respostas_setor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_pca_id UUID NOT NULL REFERENCES licitagov.campanhas_pca(id) ON DELETE CASCADE,
  setor_id UUID NOT NULL REFERENCES licitagov.setores(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expira_em TIMESTAMPTZ NOT NULL,
  revogado BOOLEAN NOT NULL DEFAULT FALSE,
  respondido_em TIMESTAMPTZ,
  snapshot JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_respostas_campanha ON licitagov.respostas_setor(campanha_pca_id);

CREATE TRIGGER trg_respostas_setor_touch
  BEFORE UPDATE ON licitagov.respostas_setor
  FOR EACH ROW EXECUTE FUNCTION licitagov.touch_updated_at();

-- ============================================================
-- ITENS DO PCA
-- ============================================================
CREATE TABLE licitagov.itens_pca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_pca_id UUID NOT NULL REFERENCES licitagov.campanhas_pca(id) ON DELETE CASCADE,
  setor_id UUID REFERENCES licitagov.setores(id) ON DELETE SET NULL,
  descricao_livre TEXT NOT NULL,
  descricao_normalizada TEXT,
  codigo_catmat VARCHAR(20),
  codigo_catser VARCHAR(20),
  categoria TEXT,
  unidade_medida VARCHAR(50),
  quantidade NUMERIC(15, 4),
  valor_unitario_estimado NUMERIC(15, 4),
  mes_demanda INTEGER CHECK (mes_demanda BETWEEN 1 AND 12),
  justificativa TEXT,
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_itens_pca_campanha ON licitagov.itens_pca(campanha_pca_id);
CREATE INDEX idx_itens_pca_catmat ON licitagov.itens_pca(codigo_catmat) WHERE codigo_catmat IS NOT NULL;

CREATE TRIGGER trg_itens_pca_touch
  BEFORE UPDATE ON licitagov.itens_pca
  FOR EACH ROW EXECUTE FUNCTION licitagov.touch_updated_at();

-- ============================================================
-- HISTORICO DE COMPRAS (snapshot interno; a fonte pública é a VIEW v_historico_pncp)
-- ============================================================
CREATE TABLE licitagov.historico_compras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orgao_id UUID NOT NULL REFERENCES licitagov.orgaos(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER CHECK (mes BETWEEN 1 AND 12),
  descricao TEXT NOT NULL,
  codigo_catmat VARCHAR(20),
  codigo_catser VARCHAR(20),
  quantidade NUMERIC(15, 4),
  valor_unitario NUMERIC(15, 4),
  valor_total NUMERIC(15, 2),
  fornecedor_cnpj VARCHAR(14),
  fornecedor_nome TEXT,
  fonte VARCHAR(30) NOT NULL DEFAULT 'manual',
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_historico_orgao_ano ON licitagov.historico_compras(orgao_id, ano);

-- ============================================================
-- PERFIS REGULATORIOS (federal / estadual UFs / municipal)
-- ============================================================
CREATE TABLE licitagov.perfis_regulatorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(20) UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  esfera VARCHAR(10) NOT NULL CHECK (esfera IN ('federal', 'estadual', 'municipal', 'distrital')),
  uf CHAR(2),
  regras JSONB NOT NULL DEFAULT '{}'::jsonb,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_perfis_regulatorios_touch
  BEFORE UPDATE ON licitagov.perfis_regulatorios
  FOR EACH ROW EXECUTE FUNCTION licitagov.touch_updated_at();

-- ============================================================
-- PROCESSOS (licitações em andamento)
-- ============================================================
CREATE TABLE licitagov.processos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orgao_id UUID NOT NULL REFERENCES licitagov.orgaos(id) ON DELETE CASCADE,
  campanha_pca_id UUID REFERENCES licitagov.campanhas_pca(id),
  numero_interno VARCHAR(100),
  objeto TEXT NOT NULL,
  tipo VARCHAR(30) CHECK (tipo IN ('material', 'servico', 'obra', 'servico_engenharia')),
  modalidade VARCHAR(30),
  criterio_julgamento VARCHAR(30),
  modo_disputa VARCHAR(30),
  valor_estimado NUMERIC(15, 2),
  fase_atual VARCHAR(30) NOT NULL DEFAULT 'dfd'
    CHECK (fase_atual IN ('dfd', 'etp', 'riscos', 'precos', 'tr', 'compliance', 'parecer', 'edital', 'publicacao', 'publicado', 'cancelado')),
  setor_requisitante_id UUID REFERENCES licitagov.setores(id) ON DELETE SET NULL,
  agente_contratacao_id UUID REFERENCES licitagov.usuarios(id) ON DELETE SET NULL,
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_processos_orgao ON licitagov.processos(orgao_id);
CREATE INDEX idx_processos_fase ON licitagov.processos(fase_atual);

CREATE TRIGGER trg_processos_touch
  BEFORE UPDATE ON licitagov.processos
  FOR EACH ROW EXECUTE FUNCTION licitagov.touch_updated_at();

-- ============================================================
-- ARTEFATOS (DFD, ETP, TR, Edital, Parecer, etc.)
-- ============================================================
CREATE TABLE licitagov.artefatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id UUID NOT NULL REFERENCES licitagov.processos(id) ON DELETE CASCADE,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN (
    'dfd', 'etp', 'mapa_riscos', 'matriz_riscos', 'pesquisa_precos',
    'tr', 'projeto_basico', 'compliance', 'parecer', 'edital', 'contrato'
  )),
  versao INTEGER NOT NULL DEFAULT 1,
  conteudo_markdown TEXT,
  conteudo_estruturado JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'gerando', 'gerado', 'revisao', 'aprovado', 'publicado')),
  modelo_usado VARCHAR(50),
  tokens_input INTEGER,
  tokens_output INTEGER,
  tempo_geracao_ms INTEGER,
  citacoes_juridicas JSONB,
  compliance_status JSONB,
  criado_por UUID REFERENCES licitagov.usuarios(id) ON DELETE SET NULL,
  aprovado_por UUID REFERENCES licitagov.usuarios(id) ON DELETE SET NULL,
  aprovado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_artefatos_processo ON licitagov.artefatos(processo_id);
CREATE INDEX idx_artefatos_tipo ON licitagov.artefatos(processo_id, tipo);

CREATE TRIGGER trg_artefatos_touch
  BEFORE UPDATE ON licitagov.artefatos
  FOR EACH ROW EXECUTE FUNCTION licitagov.touch_updated_at();

-- ============================================================
-- RISCOS IDENTIFICADOS (Fase 5)
-- ============================================================
CREATE TABLE licitagov.riscos_identificados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id UUID NOT NULL REFERENCES licitagov.processos(id) ON DELETE CASCADE,
  fase VARCHAR(30),
  descricao TEXT NOT NULL,
  probabilidade VARCHAR(10) CHECK (probabilidade IN ('baixa', 'media', 'alta')),
  impacto VARCHAR(10) CHECK (impacto IN ('baixo', 'medio', 'alto')),
  nivel_risco VARCHAR(10),
  responsavel VARCHAR(20),
  tratamento TEXT,
  mitigacao TEXT,
  sinistro_coberto_seguro BOOLEAN NOT NULL DEFAULT FALSE,
  taxa_risco NUMERIC(5, 2),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_riscos_processo ON licitagov.riscos_identificados(processo_id);

-- ============================================================
-- PESQUISA DE PREÇOS (Fase 6)
-- ============================================================
CREATE TABLE licitagov.precos_pesquisa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id UUID NOT NULL REFERENCES licitagov.processos(id) ON DELETE CASCADE,
  item_descricao TEXT NOT NULL,
  codigo_catmat VARCHAR(20),
  codigo_catser VARCHAR(20),
  fonte VARCHAR(30) CHECK (fonte IN ('painel_precos', 'contratacoes_similares', 'midia_especializada', 'fornecedor_direto', 'nfe_base', 'sinapi', 'sicro')),
  fonte_prioridade INTEGER,
  valor_unitario NUMERIC(15, 4) NOT NULL,
  data_referencia DATE,
  fornecedor_cnpj VARCHAR(14),
  fornecedor_nome TEXT,
  link_fonte TEXT,
  outlier BOOLEAN NOT NULL DEFAULT FALSE,
  outlier_justificativa TEXT,
  considerado_no_calculo BOOLEAN NOT NULL DEFAULT TRUE,
  coletado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_precos_pesquisa_processo ON licitagov.precos_pesquisa(processo_id);

CREATE TABLE licitagov.precos_estimativa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id UUID NOT NULL REFERENCES licitagov.processos(id) ON DELETE CASCADE,
  item_descricao TEXT NOT NULL,
  qtd_amostras INTEGER,
  media NUMERIC(15, 4),
  mediana NUMERIC(15, 4),
  menor_valor NUMERIC(15, 4),
  maior_valor NUMERIC(15, 4),
  desvio_padrao NUMERIC(15, 4),
  coeficiente_variacao NUMERIC(8, 4),
  metodo_escolhido VARCHAR(20) CHECK (metodo_escolhido IN ('media', 'mediana', 'menor')),
  valor_final NUMERIC(15, 4) NOT NULL,
  justificativa TEXT,
  sigiloso BOOLEAN NOT NULL DEFAULT FALSE,
  calculado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_precos_estimativa_processo ON licitagov.precos_estimativa(processo_id);

-- ============================================================
-- PUBLICAÇÕES PNCP
-- ============================================================
CREATE TABLE licitagov.publicacoes_pncp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id UUID REFERENCES licitagov.processos(id) ON DELETE SET NULL,
  campanha_pca_id UUID REFERENCES licitagov.campanhas_pca(id) ON DELETE SET NULL,
  tipo_documento VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'enviando', 'publicado', 'falhou')),
  numero_controle_pncp TEXT,
  payload_enviado JSONB,
  resposta_pncp JSONB,
  tentativas INTEGER NOT NULL DEFAULT 0,
  publicado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_publicacoes_pncp_processo ON licitagov.publicacoes_pncp(processo_id);

CREATE TRIGGER trg_publicacoes_pncp_touch
  BEFORE UPDATE ON licitagov.publicacoes_pncp
  FOR EACH ROW EXECUTE FUNCTION licitagov.touch_updated_at();

-- ============================================================
-- CATALOGO NORMALIZADO (busca semântica CATMAT/CATSER — Fase 4+)
-- ============================================================
CREATE TABLE licitagov.catalogo_normalizado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orgao_id UUID REFERENCES licitagov.orgaos(id) ON DELETE CASCADE,
  codigo_catmat VARCHAR(20),
  codigo_catser VARCHAR(20),
  descricao_oficial TEXT NOT NULL,
  descricao_normalizada TEXT,
  unidade_medida VARCHAR(50),
  categoria TEXT,
  aliases TEXT[] DEFAULT '{}',
  embedding VECTOR(1024),
  uso_count INTEGER NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_catalogo_embedding
  ON licitagov.catalogo_normalizado
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_catalogo_orgao ON licitagov.catalogo_normalizado(orgao_id);

-- ============================================================
-- AUDIT LOG (RI-9: toda mutação em licitagov.* gera audit)
-- ============================================================
CREATE TABLE licitagov.audit_log (
  id BIGSERIAL PRIMARY KEY,
  ocorreu_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id UUID,
  actor_role TEXT,
  schema_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  operacao CHAR(1) NOT NULL CHECK (operacao IN ('I', 'U', 'D')),
  row_id TEXT,
  diff JSONB
);
CREATE INDEX idx_audit_log_table ON licitagov.audit_log(table_name, ocorreu_em DESC);
CREATE INDEX idx_audit_log_actor ON licitagov.audit_log(actor_id, ocorreu_em DESC);

CREATE OR REPLACE FUNCTION licitagov.audit_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = licitagov, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_role TEXT;
  v_row_id TEXT;
  v_diff JSONB;
BEGIN
  BEGIN
    v_actor := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;
  BEGIN
    v_role := auth.role();
  EXCEPTION WHEN OTHERS THEN
    v_role := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    v_row_id := COALESCE(OLD.id::text, '');
    v_diff := to_jsonb(OLD);
  ELSIF TG_OP = 'INSERT' THEN
    v_row_id := COALESCE(NEW.id::text, '');
    v_diff := to_jsonb(NEW);
  ELSE
    v_row_id := COALESCE(NEW.id::text, '');
    v_diff := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  END IF;

  INSERT INTO licitagov.audit_log(actor_id, actor_role, schema_name, table_name, operacao, row_id, diff)
  VALUES (v_actor, v_role, TG_TABLE_SCHEMA, TG_TABLE_NAME, LEFT(TG_OP, 1), v_row_id, v_diff);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Aplica audit em todas tabelas de negócio.
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'licitagov'
      AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('audit_log', 'catalogo_normalizado')
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%1$I AFTER INSERT OR UPDATE OR DELETE ON licitagov.%1$I FOR EACH ROW EXECUTE FUNCTION licitagov.audit_row_change()',
      t.table_name
    );
  END LOOP;
END $$;

-- ============================================================
-- RLS BASE (policies detalhadas por-feature vêm nas fases subsequentes)
-- ============================================================
ALTER TABLE licitagov.orgaos ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.setores ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.campanhas_pca ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.respostas_setor ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.itens_pca ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.historico_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.perfis_regulatorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.processos ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.artefatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.riscos_identificados ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.precos_pesquisa ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.precos_estimativa ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.publicacoes_pncp ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.catalogo_normalizado ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitagov.audit_log ENABLE ROW LEVEL SECURITY;

-- Policy baseline: usuário só enxerga seu próprio órgão.
-- Mais granularidade (por papel, por processo) é adicionada nas fases futuras.
CREATE POLICY p_orgaos_select_own ON licitagov.orgaos
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT orgao_id FROM licitagov.usuarios WHERE id = auth.uid())
  );

CREATE POLICY p_usuarios_select_own_org ON licitagov.usuarios
  FOR SELECT TO authenticated
  USING (
    orgao_id IN (SELECT orgao_id FROM licitagov.usuarios WHERE id = auth.uid())
  );

CREATE POLICY p_setores_own_org ON licitagov.setores
  FOR SELECT TO authenticated
  USING (
    orgao_id IN (SELECT orgao_id FROM licitagov.usuarios WHERE id = auth.uid())
  );

CREATE POLICY p_service_role_all_orgaos ON licitagov.orgaos
  FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY p_service_role_all_usuarios ON licitagov.usuarios
  FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY p_service_role_all_setores ON licitagov.setores
  FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- ============================================================
-- VIEWs READ-ONLY sobre public.* (RI-4)
-- ============================================================
-- v_historico_pncp: expõe editais homologados de public.tenders para reuso
-- em pesquisa de preços (Fase 6). public.tenders NÃO tem codigo_catmat na
-- estrutura atual, então a VIEW entrega apenas o que existe; enriquecimento
-- CATMAT é responsabilidade do pipeline gov quando rolar.
CREATE OR REPLACE VIEW licitagov.v_historico_pncp AS
SELECT
  id AS tender_id,
  pncp_id,
  orgao_cnpj,
  orgao_nome,
  orgao_esfera,
  modalidade_id,
  modalidade_nome,
  objeto,
  valor_estimado,
  valor_homologado,
  data_publicacao,
  data_abertura,
  data_encerramento,
  uf,
  municipio,
  situacao_nome,
  status
FROM public.tenders
WHERE status = 'analyzed';

GRANT SELECT ON licitagov.v_historico_pncp TO authenticated;
GRANT SELECT ON licitagov.v_historico_pncp TO service_role;

-- NOTA: v_cnpj_publico (base RFB de CNPJs públicos) é adiada — a tabela
-- public.cnpj_rfb ainda não existe no monorepo. Quando o pipeline RFB rolar,
-- uma migration futura cria a VIEW.

-- ============================================================
-- Sanidade
-- ============================================================
COMMENT ON SCHEMA licitagov IS 'LicitaGram Gov — fase interna das licitações públicas (Lei 14.133/2021). Isolado de public.* por design (D-3, RI-4).';
