-- ============================================================
-- LICITAGOV: GRANTs faltando nas tabelas licitagov.*
-- ============================================================
-- Bug observado: "permission denied for table setores" ao tentar criar
-- um setor via client JS (`supabase.schema('licitagov').from('setores')`).
-- Causa: `GRANT USAGE ON SCHEMA licitagov TO authenticated` já foi dado
-- na migration inicial, mas cada TABELA precisa de GRANT próprio. RLS só
-- filtra quais linhas o role vê — ele ainda precisa permissão de acesso
-- à tabela.
-- ============================================================

-- Grants retroativos nas tabelas existentes
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA licitagov TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA licitagov TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA licitagov TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA licitagov TO service_role;

-- Default privileges pra tabelas futuras não precisarem mais dessa correção
ALTER DEFAULT PRIVILEGES IN SCHEMA licitagov
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA licitagov
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA licitagov
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA licitagov
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

-- anon (usado pelo /s/[token] form público) NÃO recebe grants diretos —
-- ele fala com o banco só via RPC SECURITY DEFINER (resolve_campanha_token,
-- submit_setor_itens). As RPCs já têm GRANT EXECUTE TO anon explícito.
