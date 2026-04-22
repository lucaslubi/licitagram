-- ============================================================
-- Security Advisor Fixes — 12 alertas CRITICAL
-- ============================================================
-- Resolve:
-- 1. RLS Disabled in Public: pregao_portais_health → enable + policy
-- 2. SECURITY DEFINER Views: 11 views → troca pra SECURITY INVOKER
--    (default mais seguro, respeita RLS das tabelas subjacentes)
--
-- Estratégia:
--   - Tables de dados PÚBLICOS (CATMAT, UASG, órgãos, etc) ganham policy
--     permissiva pra authenticated users lerem (não é sensível, é dado
--     governamental aberto)
--   - Tables de dados sensíveis (matches) continuam com RLS restritivo
--     já existente — view com INVOKER passa a respeitar automaticamente
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

-- ─── 2. SECURITY INVOKER em todas as views ─────────────────────────────
-- No Postgres 15+, views são SECURITY INVOKER por default, mas se foram
-- criadas com `security_definer=true` (ex: via Supabase templates antigos),
-- ficam DEFINER. Altera todas pra INVOKER explicitamente.

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
    RAISE NOTICE 'ALTER VIEW % SET security_invoker', v_schema || '.' || v_name;
  END LOOP;
END $$;

-- ─── 3. Garante que dados públicos de referência continuam legíveis ───
-- Depois que view vira INVOKER, ela passa a respeitar RLS das tabelas base.
-- Se alguma dessas tabelas tiver RLS bloqueando authenticated, a view vai
-- retornar 0 linhas. Policies abaixo garantem SELECT pra dados públicos.

-- CATMAT (catálogo de materiais — dado público do governo)
ALTER TABLE IF EXISTS public.catmat_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "catmat_public_read" ON public.catmat_items;
CREATE POLICY "catmat_public_read" ON public.catmat_items
  FOR SELECT TO authenticated USING (true);

-- CATSER (catálogo de serviços — dado público)
ALTER TABLE IF EXISTS public.catser_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "catser_public_read" ON public.catser_items;
CREATE POLICY "catser_public_read" ON public.catser_items
  FOR SELECT TO authenticated USING (true);

-- UASG (unidades administrativas)
ALTER TABLE IF EXISTS public.uasg ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "uasg_public_read" ON public.uasg;
CREATE POLICY "uasg_public_read" ON public.uasg
  FOR SELECT TO authenticated USING (true);

-- Órgãos oficiais
ALTER TABLE IF EXISTS public.orgaos_oficiais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orgaos_oficiais_public_read" ON public.orgaos_oficiais;
CREATE POLICY "orgaos_oficiais_public_read" ON public.orgaos_oficiais
  FOR SELECT TO authenticated USING (true);

-- v_matching_comparison: base subjacente é matches, que já tem RLS
-- por company_id. INVOKER nessa view passa a respeitar automaticamente.
-- Não precisa adicionar policy.

COMMENT ON VIEW public.v_catmat IS
  'CATMAT oficial do governo federal — SECURITY INVOKER + RLS permissiva';
COMMENT ON VIEW public.v_catser IS
  'CATSER oficial do governo federal — SECURITY INVOKER + RLS permissiva';
COMMENT ON VIEW public.v_uasg IS
  'UASGs (unidades administrativas de serviços gerais) — dado público';
COMMENT ON VIEW public.v_orgaos_oficiais IS
  'Órgãos públicos cadastrados no PNCP — dado público';
COMMENT ON VIEW public.v_matching_comparison IS
  'Comparação pgvector vs ai_triage. SECURITY INVOKER: respeita RLS de matches.';
