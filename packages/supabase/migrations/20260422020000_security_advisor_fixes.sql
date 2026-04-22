-- ============================================================
-- Security Advisor Fixes — 12 alertas CRITICAL (v2)
-- ============================================================
-- v1 falhou porque tentou criar policies em public.catmat_items que
-- não existe (tabelas base ficam em schema licitagov).
--
-- v2 só faz o essencial:
--   1. RLS em pregao_portais_health
--   2. ALTER VIEW SET security_invoker em 11 views
--
-- As tabelas base em licitagov já têm GRANT SELECT TO authenticated,
-- então views INVOKER continuam funcionando (o usuário autenticado
-- acessa como ele mesmo, respeitando os GRANTs).
--
-- Dados sensíveis (matches) têm RLS por company_id na tabela, que é
-- respeitado automaticamente pela view após virar INVOKER.
-- ============================================================

-- ─── 1. RLS em pregao_portais_health ───────────────────────────────────

ALTER TABLE IF EXISTS public.pregao_portais_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pregao_portais_health_read_all_authenticated" ON public.pregao_portais_health;
CREATE POLICY "pregao_portais_health_read_all_authenticated"
  ON public.pregao_portais_health
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "pregao_portais_health_service_role" ON public.pregao_portais_health;
CREATE POLICY "pregao_portais_health_service_role"
  ON public.pregao_portais_health
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── 2. SECURITY INVOKER em todas as views flagadas ────────────────────

DO $$
DECLARE
  v_schema TEXT;
  v_name TEXT;
BEGIN
  FOR v_schema, v_name IN
    SELECT schemaname, viewname
    FROM pg_views
    WHERE (schemaname, viewname) IN (
      ('public', 'v_fornecedores_gov'),
      ('public', 'v_matching_comparison'),
      ('public', 'v_catser'),
      ('public', 'v_uasg'),
      ('public', 'v_sancoes_fornecedor'),
      ('public', 'v_catmat'),
      ('public', 'v_orgaos_oficiais'),
      ('public', 'v_painel_precos_oficial'),
      ('licitagov', 'v_knowledge_sources'),
      ('licitagov', 'v_precos_historicos'),
      ('licitagov', 'v_historico_pncp')
    )
  LOOP
    EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', v_schema, v_name);
    RAISE NOTICE 'ALTER VIEW %.% SET security_invoker=true', v_schema, v_name;
  END LOOP;
END $$;
