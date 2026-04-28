-- ============================================================
-- bot_configs: tornar colunas legadas nullable
-- ============================================================
-- A tabela bot_configs nasceu pra config do bot Compras.gov (com username
-- + password obrigatórios). Hoje também armazena prefs de notificação
-- (portal='_notifications') que NÃO precisam dessas colunas.
--
-- Erro reportado pelo cliente em /conta/notificacoes:
--   "null value in column username of relation bot_configs violates
--    not-null constraint"
--
-- Fix: drop NOT NULL de TODAS as colunas legadas exceto identidade
-- (id, company_id, portal, created_at, updated_at).
-- username ganha default '' pra retrocompat com queries antigas.
-- ============================================================

ALTER TABLE public.bot_configs ALTER COLUMN username DROP NOT NULL;
ALTER TABLE public.bot_configs ALTER COLUMN username SET DEFAULT '';

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bot_configs'
      AND is_nullable='NO'
      AND column_name NOT IN ('id','company_id','portal','created_at','updated_at')
  LOOP
    EXECUTE format('ALTER TABLE public.bot_configs ALTER COLUMN %I DROP NOT NULL', c.column_name);
    RAISE NOTICE 'dropped NOT NULL from bot_configs.%', c.column_name;
  END LOOP;
END $$;
