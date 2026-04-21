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
--    Dropa constraint existente (qualquer nome) e recria.
DO $$
DECLARE v_conname TEXT;
BEGIN
  FOR v_conname IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.bot_sessions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.bot_sessions DROP CONSTRAINT IF EXISTS %I', v_conname);
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
--    Cria N sessões em transação, respeita idempotency_key por item.
CREATE OR REPLACE FUNCTION public.bulk_create_bot_sessions(
  p_company_id UUID,
  p_sessions JSONB
)
RETURNS TABLE (
  session_id UUID,
  pregao_id TEXT,
  status TEXT,
  error TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item JSONB;
  v_config_id UUID;
  v_existing UUID;
  v_new_id UUID;
  v_idempotency TEXT;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_sessions)
  LOOP
    v_idempotency := v_item->>'idempotency_key';
    v_config_id := (v_item->>'config_id')::UUID;

    -- Valida config pertence à company
    IF NOT EXISTS (
      SELECT 1 FROM public.bot_configs
      WHERE id = v_config_id AND company_id = p_company_id
    ) THEN
      session_id := NULL;
      pregao_id := v_item->>'pregao_id';
      status := 'error';
      error := 'config_id inválido pra company';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Idempotency: reusa sessão existente se key bate
    IF v_idempotency IS NOT NULL THEN
      SELECT id INTO v_existing
      FROM public.bot_sessions
      WHERE company_id = p_company_id
        AND idempotency_key = v_idempotency
      LIMIT 1;

      IF v_existing IS NOT NULL THEN
        session_id := v_existing;
        pregao_id := v_item->>'pregao_id';
        status := 'deduped';
        error := NULL;
        RETURN NEXT;
        CONTINUE;
      END IF;
    END IF;

    -- Insert
    INSERT INTO public.bot_sessions (
      company_id, config_id, pregao_id, tender_id, portal,
      strategy_config, min_price, max_bids, mode,
      idempotency_key, scheduled_at,
      status
    ) VALUES (
      p_company_id,
      v_config_id,
      v_item->>'pregao_id',
      NULLIF(v_item->>'tender_id', '')::UUID,
      v_item->>'portal',
      COALESCE(v_item->'strategy_config', '{}'::jsonb),
      NULLIF(v_item->>'min_price', '')::NUMERIC,
      NULLIF(v_item->>'max_bids', '')::INTEGER,
      COALESCE(v_item->>'mode', 'supervisor'),
      v_idempotency,
      NULLIF(v_item->>'scheduled_at', '')::TIMESTAMPTZ,
      -- Se scheduled_at foi informado e é no futuro, status='scheduled'.
      -- Senão, 'pending' pra executar agora.
      CASE
        WHEN v_item->>'scheduled_at' IS NOT NULL
          AND (v_item->>'scheduled_at')::TIMESTAMPTZ > NOW()
        THEN 'scheduled'
        ELSE 'pending'
      END
    )
    RETURNING id INTO v_new_id;

    session_id := v_new_id;
    pregao_id := v_item->>'pregao_id';
    status := 'created';
    error := NULL;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_create_bot_sessions(UUID, JSONB) TO authenticated, service_role;

COMMENT ON FUNCTION public.bulk_create_bot_sessions IS
  'Cria múltiplas bot_sessions em transação. Cada item do array p_sessions deve ter config_id, pregao_id e opcionalmente scheduled_at. Retorna status por item (created/deduped/error).';
