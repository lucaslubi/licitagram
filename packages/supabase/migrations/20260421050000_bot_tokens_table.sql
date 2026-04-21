-- ============================================================
-- Bot Tokens — JWTs do Compras.gov.br por empresa
-- ============================================================
-- Cliente loga uma vez no Compras.gov.br através do nosso web e
-- extraímos o JWT (via bookmarklet ou postMessage) e guardamos aqui.
-- O worker usa esses tokens pra bater direto na API REST do portal
-- em vez de automatizar navegador. Zero Playwright.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bot_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  portal VARCHAR(40) NOT NULL DEFAULT 'comprasgov',

  -- JWTs criptografados (mesmo padrão do bot_configs: AES-256-GCM)
  access_token_cipher BYTEA NOT NULL,
  access_token_nonce  BYTEA NOT NULL,
  refresh_token_cipher BYTEA,
  refresh_token_nonce  BYTEA,

  -- Cache do exp (epoch seconds) pra query rápida sem decodar
  access_exp BIGINT,
  refresh_exp BIGINT,

  -- Metadados do token (do payload JWT) — útil pra debug/UI
  cnpj_fornecedor TEXT,
  nome_fornecedor TEXT,
  id_sessao TEXT,

  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked')),

  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  last_refresh_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (company_id, portal)
);

CREATE INDEX IF NOT EXISTS idx_bot_tokens_company ON public.bot_tokens(company_id, status);
CREATE INDEX IF NOT EXISTS idx_bot_tokens_expiring ON public.bot_tokens(access_exp) WHERE status = 'active';

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.bot_tokens_update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_bot_tokens_updated_at ON public.bot_tokens;
CREATE TRIGGER trg_bot_tokens_updated_at
  BEFORE UPDATE ON public.bot_tokens
  FOR EACH ROW EXECUTE FUNCTION public.bot_tokens_update_updated_at();

-- RLS: só a própria empresa vê seus tokens
ALTER TABLE public.bot_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bot_tokens_own_company" ON public.bot_tokens;
CREATE POLICY "bot_tokens_own_company" ON public.bot_tokens
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.users WHERE id = auth.uid()
    )
  );

-- Service role bypassa (worker precisa ler de qualquer company)
DROP POLICY IF EXISTS "bot_tokens_service_role" ON public.bot_tokens;
CREATE POLICY "bot_tokens_service_role" ON public.bot_tokens
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.bot_tokens IS
  'JWTs do Compras.gov.br extraídos do navegador do cliente após login. Usado pelo bot engine pra bater direto na API REST do portal em vez de automatizar browser.';
