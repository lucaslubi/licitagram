-- ============================================================
-- Bot Connect Tokens — chaves únicas temporárias
-- ============================================================
-- Problema: bookmarklet abria nova aba no licitagram.com e se o cookie
-- de sessão expirou ou o navegador bloqueia cross-site cookies, caía
-- na tela de login perdendo os tokens capturados do Compras.gov.br.
--
-- Solução: user clica "Gerar meu bookmarklet" estando autenticado,
-- nós geramos um UUID válido por 10 minutos associado ao company_id.
-- O bookmarklet carrega essa UUID embutida. Quando o user clica nele
-- DENTRO do Compras.gov.br, o POST vai pra callback com UUID + tokens
-- e a callback identifica a company pela UUID em vez de cookie.
--
-- Assim funciona mesmo se o cookie do licitagram já expirou.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bot_connect_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_connect_tokens_active
  ON public.bot_connect_tokens (id)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bot_connect_tokens_cleanup
  ON public.bot_connect_tokens (expires_at)
  WHERE used_at IS NULL;

-- RLS: user só vê chaves que ele criou
ALTER TABLE public.bot_connect_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bot_connect_tokens_own" ON public.bot_connect_tokens;
CREATE POLICY "bot_connect_tokens_own" ON public.bot_connect_tokens
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "bot_connect_tokens_service_role" ON public.bot_connect_tokens;
CREATE POLICY "bot_connect_tokens_service_role" ON public.bot_connect_tokens
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.bot_connect_tokens IS
  'Chaves únicas (UUID) válidas por 10min pra autorizar o bookmarklet sem depender de cookie de sessão cross-site.';
