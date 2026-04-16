-- Pregão Chat Monitor — public mode (no credentials required)
--
-- Some portals (Compras.gov.br being the main one in Apr/2026) expose
-- the chat of an ongoing pregão publicly. You don't need fornecedor
-- credentials just to READ the pregoeiro's messages. We over-engineered
-- the original flow by forcing users through a guided Gov.br login.
--
-- This migration unlocks the "public monitoring" path:
--   - credencial_id becomes nullable
--   - when null, the worker opens the URL with stealth Playwright
--     (no login, solves captcha via CapSolver if challenged)

ALTER TABLE public.pregoes_monitorados
  ALTER COLUMN credencial_id DROP NOT NULL;

-- Keep the FK: if the row IS tied to a credential, deleting the credential
-- should still RESTRICT (unchanged). If the row is public (credencial_id null),
-- there's nothing to cascade.

COMMENT ON COLUMN public.pregoes_monitorados.credencial_id IS
  'Optional. When NULL, the pregão is monitored in public/read-only mode — '
  'worker opens the URL without login. Used for portals whose chat is public '
  '(e.g. Compras.gov.br).';

NOTIFY pgrst, 'reload schema';
