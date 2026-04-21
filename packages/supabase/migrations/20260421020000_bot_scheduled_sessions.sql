-- ============================================================
-- Bot Supreme: agendamento de sessões de lance
-- ============================================================
-- Permite criar sessões de lance em lote com horário de início específico
-- (scheduled_at). Watchdog detecta sessões com scheduled_at <= now() e
-- status='scheduled' → promove pra 'pending' + enfileira execução.
--
-- Caso de uso: cliente cadastra 20 pregões de uma semana inteira, cada
-- um com disputa em horário diferente. Sistema autonomamente inicia cada
-- sessão no momento certo.
-- ============================================================

-- 1. Coluna scheduled_at — quando a sessão deve começar.
--    NULL = iniciar imediatamente (comportamento legado preservado).
ALTER TABLE public.bot_sessions
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- 2. Expandir CHECK constraint do status pra incluir 'scheduled'.
DO $$
DECLARE _conname TEXT;
BEGIN
  FOR _conname IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.bot_sessions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.bot_sessions DROP CONSTRAINT IF EXISTS %I', _conname);
  END LOOP;
END $$;

ALTER TABLE public.bot_sessions
  ADD CONSTRAINT bot_sessions_status_check
  CHECK (status IN (
    'scheduled',   -- aguardando horário de início (scheduled_at)
    'pending',     -- pronta pra ser pega por worker
    'active',      -- em execução
    'paused',      -- pausada manualmente
    'completed',   -- concluída com sucesso
    'failed',      -- erro irrecuperável
    'cancelled'    -- cancelada pelo usuário
  ));

-- 3. Índice pro sweep do watchdog (scheduled + scheduled_at passou)
CREATE INDEX IF NOT EXISTS idx_bot_sessions_scheduled_due
  ON public.bot_sessions (scheduled_at)
  WHERE status = 'scheduled';

-- 4. Índice pra listagens por company (war room)
CREATE INDEX IF NOT EXISTS idx_bot_sessions_company_status
  ON public.bot_sessions (company_id, status, scheduled_at DESC);

-- 5. RPC: bulk_create_bot_sessions
--    Cria N sessões em transação. Variáveis com prefixo _ em vez de v_
--    pra evitar bug do parser do Supabase SQL Editor que resolve v_*
--    como tentativa de nome de relação antes da fase PL/pgSQL.
DROP FUNCTION IF EXISTS public.bulk_create_bot_sessions(UUID, JSONB);

CREATE OR REPLACE FUNCTION public.bulk_create_bot_sessions(
  p_company_id UUID,
  p_sessions JSONB
)
RETURNS TABLE (
  result_session_id UUID,
  result_pregao_id TEXT,
  result_status TEXT,
  result_error TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  _item JSONB;
  _config_id UUID;
  _existing_id UUID;
  _new_id UUID;
  _idempotency TEXT;
  _pregao TEXT;
  _scheduled TIMESTAMPTZ;
  _decided_status TEXT;
BEGIN
  FOR _item IN SELECT * FROM jsonb_array_elements(p_sessions)
  LOOP
    _idempotency := _item->>'idempotency_key';
    _config_id := NULLIF(_item->>'config_id', '')::UUID;
    _pregao := _item->>'pregao_id';
    _scheduled := NULLIF(_item->>'scheduled_at', '')::TIMESTAMPTZ;

    -- Valida config pertence à company
    IF NOT EXISTS (
      SELECT 1 FROM public.bot_configs
      WHERE id = _config_id AND company_id = p_company_id
    ) THEN
      result_session_id := NULL;
      result_pregao_id := _pregao;
      result_status := 'error';
      result_error := 'config_id inválido pra company';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Idempotency: reusa sessão existente se key bate
    IF _idempotency IS NOT NULL THEN
      SELECT bs.id
        INTO _existing_id
        FROM public.bot_sessions bs
       WHERE bs.company_id = p_company_id
         AND bs.idempotency_key = _idempotency
       LIMIT 1;

      IF _existing_id IS NOT NULL THEN
        result_session_id := _existing_id;
        result_pregao_id := _pregao;
        result_status := 'deduped';
        result_error := NULL;
        RETURN NEXT;
        _existing_id := NULL;
        CONTINUE;
      END IF;
    END IF;

    -- Decide status baseado no scheduled_at
    IF _scheduled IS NOT NULL AND _scheduled > NOW() THEN
      _decided_status := 'scheduled';
    ELSE
      _decided_status := 'pending';
    END IF;

    -- Insert
    INSERT INTO public.bot_sessions (
      company_id, config_id, pregao_id, tender_id, portal,
      strategy_config, min_price, max_bids, mode,
      idempotency_key, scheduled_at, status
    ) VALUES (
      p_company_id,
      _config_id,
      _pregao,
      NULLIF(_item->>'tender_id', '')::UUID,
      _item->>'portal',
      COALESCE(_item->'strategy_config', '{}'::jsonb),
      NULLIF(_item->>'min_price', '')::NUMERIC,
      NULLIF(_item->>'max_bids', '')::INTEGER,
      COALESCE(_item->>'mode', 'supervisor'),
      _idempotency,
      _scheduled,
      _decided_status
    )
    RETURNING id INTO _new_id;

    result_session_id := _new_id;
    result_pregao_id := _pregao;
    result_status := 'created';
    result_error := NULL;
    RETURN NEXT;
    _new_id := NULL;
  END LOOP;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.bulk_create_bot_sessions(UUID, JSONB) TO authenticated, service_role;

COMMENT ON FUNCTION public.bulk_create_bot_sessions IS
  'Cria múltiplas bot_sessions em transação. Cada item do array p_sessions deve ter config_id, pregao_id e opcionalmente scheduled_at. Retorna status por item (created/deduped/error).';
