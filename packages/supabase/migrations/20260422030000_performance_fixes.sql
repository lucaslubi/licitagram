-- ============================================================
-- Performance Fixes — Advisor audit
-- ============================================================
-- Resolve 3 categorias:
-- 1. Drop índices zombie (2 GB desperdiçados, nunca usados)
-- 2. VACUUM em tabelas com bloat alto
-- 3. Create index nos FKs críticos (evita sequential scan em JOIN)
-- ============================================================

-- ─── P0: DROP índices zombies (idx_scan = 0 ao longo de semanas) ──────

-- IMPORTANTE: não dropamos UNIQUE keys (pkey, _key, _unique) mesmo com
-- idx_scan=0 porque são usadas pra garantir unicidade em INSERTs.

-- tender_documents: 1.5 GB em índice trigram nunca usado
DROP INDEX IF EXISTS public.idx_tender_docs_texto_trgm;

-- tenders: 288 MB em trigrams redundantes (temos outros pra full-text)
DROP INDEX IF EXISTS public.idx_tenders_objeto_trgm;
DROP INDEX IF EXISTS public.idx_tenders_objeto_unaccent_trgm;
DROP INDEX IF EXISTS public.idx_tenders_fts_valor;

-- tender_items: 20 MB em FTS não usado
DROP INDEX IF EXISTS public.idx_tender_items_fts;

-- cat_catmat: 119 MB em trigram descrição (o RPC de busca usa outro path)
DROP INDEX IF EXISTS licitagov.idx_catmat_descricao_trgm;

-- matches: 11 MB em coluna analyzed_at que nunca foi filtrada por index
DROP INDEX IF EXISTS public.idx_matches_analyzed_at;

-- Outros zombie menores
DROP INDEX IF EXISTS public.idx_scraping_jobs_status;
DROP INDEX IF EXISTS public.idx_system_metrics_name_time;
DROP INDEX IF EXISTS public.idx_system_metrics_name;
DROP INDEX IF EXISTS public.idx_competitors_porte;
DROP INDEX IF EXISTS licitagov.idx_uasg_nome_trgm;

-- ─── P0: VACUUM ANALYZE em tabelas com bloat alto ─────────────────────
-- Nota: VACUUM não pode rodar dentro de transação. Comandos abaixo
-- executam fora do DO block — cada linha é um statement próprio.

VACUUM ANALYZE public.scraping_jobs;
VACUUM ANALYZE public.matches;
VACUUM ANALYZE public.price_history;
VACUUM ANALYZE public.competitors;

-- ─── P1: Índices nos FKs críticos ─────────────────────────────────────
-- FKs sem índice pagam scan completo em JOIN e em cascade delete.

CREATE INDEX IF NOT EXISTS idx_proposals_match_id
  ON public.proposals (match_id);

CREATE INDEX IF NOT EXISTS idx_drive_files_user_id
  ON public.drive_files (user_id);

CREATE INDEX IF NOT EXISTS idx_bot_sessions_config_id
  ON public.bot_sessions (config_id);

CREATE INDEX IF NOT EXISTS idx_bot_sessions_tender_id
  ON public.bot_sessions (tender_id);

CREATE INDEX IF NOT EXISTS idx_impugnations_match_id
  ON public.impugnations (match_id);

CREATE INDEX IF NOT EXISTS idx_admin_alerts_resolved_by
  ON public.admin_alerts (resolved_by);

CREATE INDEX IF NOT EXISTS idx_bot_connect_tokens_company_id
  ON public.bot_connect_tokens (company_id);

CREATE INDEX IF NOT EXISTS idx_bid_outcomes_tender_id
  ON public.bid_outcomes (tender_id);

CREATE INDEX IF NOT EXISTS idx_site_settings_updated_by
  ON public.site_settings (updated_by);

CREATE INDEX IF NOT EXISTS idx_bot_api_keys_created_by
  ON public.bot_api_keys (created_by);

CREATE INDEX IF NOT EXISTS idx_pregoes_monitorados_credencial
  ON public.pregoes_monitorados (credencial_id);

-- Schema licitagov
CREATE INDEX IF NOT EXISTS idx_artefatos_criado_por
  ON licitagov.artefatos (criado_por);

CREATE INDEX IF NOT EXISTS idx_artefatos_aprovado_por
  ON licitagov.artefatos (aprovado_por);

CREATE INDEX IF NOT EXISTS idx_setores_responsavel_id
  ON licitagov.setores (responsavel_id);

CREATE INDEX IF NOT EXISTS idx_campanhas_pca_criado_por
  ON licitagov.campanhas_pca (criado_por);

CREATE INDEX IF NOT EXISTS idx_respostas_setor_setor_id
  ON licitagov.respostas_setor (setor_id);

CREATE INDEX IF NOT EXISTS idx_processos_campanha_pca
  ON licitagov.processos (campanha_pca_id);

CREATE INDEX IF NOT EXISTS idx_processos_setor_requisitante
  ON licitagov.processos (setor_requisitante_id);

CREATE INDEX IF NOT EXISTS idx_processos_agente_contratacao
  ON licitagov.processos (agente_contratacao_id);

CREATE INDEX IF NOT EXISTS idx_convites_equipe_criado_por
  ON licitagov.convites_equipe (criado_por);

COMMENT ON INDEX public.idx_bot_sessions_config_id IS
  'Criado pós-audit de performance — FK de bot_sessions → bot_configs estava sem índice';
