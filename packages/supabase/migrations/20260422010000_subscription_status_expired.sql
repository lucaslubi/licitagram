-- ============================================================
-- Permite status='expired' em subscriptions
-- ============================================================
-- O trial-expiry.processor setava status='expired' mas o CHECK constraint
-- original só permitia ('active', 'inactive', 'trialing', 'canceled').
-- Resultado: updates do worker falhavam silenciosamente e trials vencidos
-- continuavam com status='trialing'. Adicionamos 'expired' à whitelist.
-- ============================================================

DO $$
DECLARE _cname TEXT;
BEGIN
  FOR _cname IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS %I', _cname);
  END LOOP;
END $$;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'inactive', 'trialing', 'canceled', 'expired'));

-- Marca trials com expires_at passado como expired agora
UPDATE public.subscriptions
   SET status = 'expired'
 WHERE plan = 'trial'
   AND status = 'trialing'
   AND expires_at IS NOT NULL
   AND expires_at < NOW();
